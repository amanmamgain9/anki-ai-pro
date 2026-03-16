"use client";

import { anyApi } from "convex/server";
import { useQuery } from "convex/react";
import Link from "next/link";
import Script from "next/script";
import { useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";

const api = anyApi;
type CheckoutPlan =
  | "pro_monthly";
type BillingState = {
  isActive?: boolean;
  plan?: "free" | "pro" | "pro_plus";
  subscriptionStatus?: string | null;
  paddleCustomerId?: string | null;
  blockingSubscriptionIds?: string[] | null;
  trialActive?: boolean;
  trialEndsAt?: number | null;
  proPreviewQuotaChars?: number | null;
  proPreviewUsedChars?: number | null;
  proPreviewRemainingChars?: number | null;
};
type PlanAvailability = Record<CheckoutPlan, boolean>;
type CheckoutPayload = {
  priceId?: string;
  customerEmail?: string;
  paddleCustomerId?: string | null;
  externalId?: string;
  error?: string;
};

const DEFAULT_PLAN_AVAILABILITY: PlanAvailability = {
  pro_monthly: true,
};
const PADDLE_SCRIPT_SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";
const PADDLE_CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
const PADDLE_ENV = process.env.NEXT_PUBLIC_PADDLE_ENV ?? "production";

function initializePaddleForBilling() {
  if (!PADDLE_CLIENT_TOKEN) return false;
  const paddle = window.Paddle;
  if (!paddle || typeof paddle.Initialize !== "function") return false;
  if (window.__aiankiPaddleInitialized) return true;
  if (PADDLE_ENV === "sandbox" && paddle.Environment?.set) {
    paddle.Environment.set("sandbox");
  }
  const successUrl = `${window.location.origin}/settings?billing=success`;
  paddle.Initialize({
    token: PADDLE_CLIENT_TOKEN,
    eventCallback(event) {
      if (event?.name === "checkout.completed") {
        window.location.replace(successUrl);
      }
    },
    checkout: {
      settings: {
        displayMode: "overlay",
        successUrl,
      },
    },
  });
  window.__aiankiPaddleInitialized = true;
  return true;
}

export default function SettingsView() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const billing = useQuery(api.billing.getMyBilling) as BillingState | undefined;
  const [busyAction, setBusyAction] = useState<CheckoutPlan | "portal" | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [planAvailability, setPlanAvailability] = useState<PlanAvailability>(
    DEFAULT_PLAN_AVAILABILITY,
  );
  const [paddleReady, setPaddleReady] = useState(false);
  const requiresBillingManagement = Boolean(
    billing?.isActive || ((billing?.blockingSubscriptionIds?.length ?? 0) > 0),
  );
  const primaryActionUsesPortal = Boolean(
    billing?.paddleCustomerId && requiresBillingManagement,
  );
  const trialEndsAt = typeof billing?.trialEndsAt === "number" ? billing.trialEndsAt : null;
  const trialDaysLeft =
    trialEndsAt === null ? 0 : Math.max(0, Math.ceil((trialEndsAt - Date.now()) / 86_400_000));
  const billingSuccess = searchParams.get("billing") === "success";
  const upgradeRequired = searchParams.get("upgrade") === "required";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/paddle/plans", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          plans?: Array<{ plan?: string; checkoutEnabled?: boolean }>;
        };
        if (!Array.isArray(payload.plans)) return;
        const nextAvailability: PlanAvailability = { ...DEFAULT_PLAN_AVAILABILITY };
        for (const row of payload.plans) {
          if (!row.plan || !(row.plan in nextAvailability)) continue;
          nextAvailability[row.plan as CheckoutPlan] = Boolean(row.checkoutEnabled);
        }
        if (!cancelled) {
          setPlanAvailability(nextAvailability);
        }
      } catch {
        // Keep default availability; checkout endpoint still validates.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!PADDLE_CLIENT_TOKEN) return;
    if (initializePaddleForBilling()) {
      setPaddleReady(true);
    }
  }, []);

  useEffect(() => {
    if (!upgradeRequired) return;
    if (primaryActionUsesPortal) return;
    setShowUpgradeModal(true);
  }, [primaryActionUsesPortal, upgradeRequired]);

  async function startCheckout(plan: CheckoutPlan) {
    setShowUpgradeModal(false);
    setBillingError(null);
    setBusyAction(plan);
    try {
      if (!PADDLE_CLIENT_TOKEN) {
        throw new Error(
          t("app.settings.missingClientConfig"),
        );
      }
      if (!paddleReady && !initializePaddleForBilling()) {
        throw new Error(
          t("app.settings.checkoutNotReady"),
        );
      }
      const response = await fetch("/api/paddle/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const payload = (await response.json()) as CheckoutPayload;
      if (!response.ok || !payload.priceId || !payload.customerEmail || !payload.externalId) {
        throw new Error(payload.error ?? "Failed to create Paddle checkout");
      }
      const open = window.Paddle?.Checkout?.open;
      if (typeof open !== "function") {
        throw new Error(
          t("app.settings.checkoutDidNotLoad"),
        );
      }
      open({
        items: [{ priceId: payload.priceId, quantity: 1 }],
        customer: payload.paddleCustomerId
          ? { id: payload.paddleCustomerId }
          : { email: payload.customerEmail },
        customData: {
          externalId: payload.externalId,
        },
      });
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function openPortal() {
    setBillingError(null);
    setBusyAction("portal");
    try {
      const response = await fetch("/api/paddle/portal", {
        method: "POST",
      });
      const payload = (await response.json()) as { portalUrl?: string; error?: string };
      if (!response.ok || !payload.portalUrl) {
        throw new Error(payload.error ?? "Failed to open customer portal");
      }
      window.location.href = payload.portalUrl;
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Portal failed");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight"><span className="gradient-text">{t("app.settings.title")}</span></h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{t("app.settings.subtitle")}</p>
      </div>
      <div className="card-surface p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">{t("app.settings.account")}</h2>
        <p className="mt-3 text-sm">
          <span className="font-semibold">{t("app.settings.name")}</span> {session?.user?.name ?? t("app.settings.googleUser")}
        </p>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          <span className="font-semibold text-[var(--color-text)]">{t("app.settings.email")}</span> {session?.user?.email ?? t("app.settings.notAvailable")}
        </p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="btn-secondary mt-4"
        >
          {t("app.signOut")}
        </button>
      </div>
      <div className="card-surface p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">{t("app.settings.billing")}</h2>
        <p className="mt-3 text-sm">
          <span className="font-semibold">{t("app.settings.plan")}</span>{" "}
          {billing?.isActive
            ? billing?.plan === "pro_plus"
              ? "Pro+"
              : "Pro"
            : t("app.settings.free")}
        </p>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          <span className="font-semibold text-[var(--color-text)]">{t("app.settings.subscriptionStatus")}</span>{" "}
          {billing?.subscriptionStatus ?? t("app.settings.none")}
        </p>
        {billing?.trialActive && (
          <p className="mt-1 text-sm text-[var(--color-accent)]">
            {t(trialDaysLeft === 1 ? "app.settings.trialActiveSingular" : "app.settings.trialActive", {
              count: trialDaysLeft,
            })}
          </p>
        )}
        {billing?.isActive && billing?.plan === "pro" && typeof billing.proPreviewQuotaChars === "number" && (
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {t("app.settings.proVoicePreview", {
              remaining: billing.proPreviewRemainingChars ?? 0,
              quota: billing.proPreviewQuotaChars,
              used: billing.proPreviewUsedChars ?? 0,
            })}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (primaryActionUsesPortal) {
                void openPortal();
                return;
              }
              setShowUpgradeModal(true);
            }}
            className="btn-primary"
            disabled={busyAction !== null}
          >
            {busyAction
              ? t("app.settings.opening")
              : primaryActionUsesPortal
                ? t("app.settings.manageBilling")
                : billing?.isActive
                  ? t("app.settings.changePlan")
                  : t("app.upgradeCta")}
          </button>
          {billing?.paddleCustomerId && !primaryActionUsesPortal ? (
            <button
              type="button"
              onClick={openPortal}
              className="btn-secondary"
              disabled={busyAction !== null}
            >
              {busyAction === "portal" ? t("app.settings.opening") : t("app.settings.manageBilling")}
            </button>
          ) : null}
        </div>
        {billingSuccess && (
          <p className="mt-3 text-sm text-[var(--color-accent)]">
            {t("app.settings.checkoutSuccess")}
          </p>
        )}
        {billingError && (
          <p className="mt-3 text-sm text-[var(--color-danger)]">{billingError}</p>
        )}
        {PADDLE_CLIENT_TOKEN ? (
          <Script
            src={PADDLE_SCRIPT_SRC}
            strategy="afterInteractive"
            onLoad={() => {
              if (initializePaddleForBilling()) {
                setPaddleReady(true);
              }
            }}
          />
        ) : null}
      </div>
      {showUpgradeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold">{t("app.settings.choosePlan")}</h3>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {t("app.settings.continueToCheckout")}
                </p>
              </div>
              {!upgradeRequired ? (
                <button
                  type="button"
                  onClick={() => setShowUpgradeModal(false)}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                >
                  {t("app.settings.close")}
                </button>
              ) : null}
            </div>

            <div className="mt-4">
              <div className="rounded-xl border border-[var(--color-border)] p-3">
                <p className="text-sm font-semibold">Pro</p>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{t("app.settings.proMonthlyPrice")}</p>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => startCheckout("pro_monthly")}
                    className="btn-primary !px-3 !py-1.5 !text-xs"
                    disabled={busyAction !== null || !planAvailability.pro_monthly}
                  >
                    {busyAction === "pro_monthly" ? t("app.settings.opening") : t("app.settings.startPro")}
                  </button>
                </div>
                {!planAvailability.pro_monthly && (
                  <p className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">
                    {t("app.settings.checkoutUnavailable")}
                  </p>
                )}
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-[var(--color-text-secondary)]">
              {t("app.settings.legalNoticePrefix")}
              <Link href="/terms" target="_blank" className="font-semibold text-[var(--color-accent)]">
                {t("common.terms")}
              </Link>
              {t("app.settings.legalNoticeMiddle")}
              <Link href="/privacy" target="_blank" className="font-semibold text-[var(--color-accent)]">
                {t("common.privacy")}
              </Link>
              {t("app.settings.legalNoticeAnd")}
              <Link href="/refund-policy" target="_blank" className="font-semibold text-[var(--color-accent)]">
                {t("common.refundPolicy")}
              </Link>
              {t("app.settings.legalNoticeSuffix")}
            </p>
          </div>
        </div>
      )}
      <div className="card-surface p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">{t("app.settings.legal")}</h2>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link href="/terms" className="text-[var(--color-accent)] hover:underline">
            {t("common.terms")}
          </Link>
          <Link href="/privacy" className="text-[var(--color-accent)] hover:underline">
            {t("common.privacy")}
          </Link>
          <Link href="/refund-policy" className="text-[var(--color-accent)] hover:underline">
            {t("common.refundPolicy")}
          </Link>
        </div>
      </div>
    </div>
  );
}
