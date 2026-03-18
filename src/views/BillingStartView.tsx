"use client";

import { anyApi } from "convex/server";
import { useQuery } from "convex/react";
import Link from "next/link";
import Script from "next/script";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";

const api = anyApi;
type CheckoutPlan = "pro_monthly";
type BillingState = {
  isActive?: boolean;
  trialActive?: boolean;
  plan?: "free" | "pro" | "pro_plus";
  subscriptionStatus?: string | null;
  paddleCustomerId?: string | null;
  blockingSubscriptionIds?: string[] | null;
  trialEndsAt?: number | null;
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

function initializePaddleForBilling(successUrl: string) {
  window.__aiankiPaddleCheckoutSuccessUrl = successUrl;
  if (!PADDLE_CLIENT_TOKEN) return false;
  const paddle = window.Paddle;
  if (!paddle || typeof paddle.Initialize !== "function") return false;
  if (window.__aiankiPaddleInitialized) return true;
  if (PADDLE_ENV === "sandbox" && paddle.Environment?.set) {
    paddle.Environment.set("sandbox");
  }
  paddle.Initialize({
    token: PADDLE_CLIENT_TOKEN,
    eventCallback(event) {
      if (event?.name === "checkout.completed") {
        const target = window.__aiankiPaddleCheckoutSuccessUrl ?? successUrl;
        window.location.replace(target);
      }
    },
    checkout: {
      settings: {
        displayMode: "overlay",
      },
    },
  });
  window.__aiankiPaddleInitialized = true;
  return true;
}

export default function BillingStartView() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const billing = useQuery(api.billing.getMyBilling) as BillingState | undefined;
  const [busyAction, setBusyAction] = useState<CheckoutPlan | "portal" | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [planAvailability, setPlanAvailability] = useState<PlanAvailability>(
    DEFAULT_PLAN_AVAILABILITY,
  );
  const [paddleReady, setPaddleReady] = useState(false);
  const from = searchParams.get("from") || "/cards";
  const billingSuccess = searchParams.get("billing") === "success";
  const requiresBillingManagement = Boolean(
    (billing?.blockingSubscriptionIds?.length ?? 0) > 0 && billing?.paddleCustomerId,
  );
  const hasProAccess = Boolean(billing?.isActive || billing?.trialActive);
  const trialEndsAt = typeof billing?.trialEndsAt === "number" ? billing.trialEndsAt : null;
  const trialDaysLeft =
    trialEndsAt === null ? 0 : Math.max(0, Math.ceil((trialEndsAt - Date.now()) / 86_400_000));
  const successUrl =
    typeof window === "undefined"
      ? `/start-trial?billing=success&from=${encodeURIComponent(from)}`
      : `${window.location.origin}/start-trial?billing=success&from=${encodeURIComponent(from)}`;

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
        if (!cancelled) setPlanAvailability(nextAvailability);
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
    if (initializePaddleForBilling(successUrl)) {
      setPaddleReady(true);
    }
  }, [successUrl]);

  useEffect(() => {
    if (!hasProAccess) return;
    router.replace(from);
  }, [from, hasProAccess, router]);

  async function startCheckout(plan: CheckoutPlan) {
    setBillingError(null);
    setBusyAction(plan);
    try {
      if (!PADDLE_CLIENT_TOKEN) {
        throw new Error(t("app.settings.missingClientConfig"));
      }
      if (!paddleReady && !initializePaddleForBilling(successUrl)) {
        throw new Error(t("app.settings.checkoutNotReady"));
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
        throw new Error(t("app.settings.checkoutDidNotLoad"));
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
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-3xl items-center justify-center px-4 py-8">
      <div className="card-surface w-full max-w-2xl p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-accent)]">
          aiankipro
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          {requiresBillingManagement
            ? t("app.billingStart.titleManage")
            : t("app.billingStart.titleStart")}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--color-text-secondary)]">
          {requiresBillingManagement
            ? t("app.billingStart.subtitleManage")
            : t("app.billingStart.subtitleStart")}
        </p>

        {billing?.trialActive && (
          <p className="mt-3 text-sm text-[var(--color-accent)]">
            {t(
              trialDaysLeft === 1
                ? "app.settings.trialActiveSingular"
                : "app.settings.trialActive",
              { count: trialDaysLeft },
            )}
          </p>
        )}

        <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-4">
          <p className="text-sm font-semibold text-[var(--color-text)]">
            {t("app.billingStart.accountEmail")}
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {session?.user?.email ?? t("app.settings.notAvailable")}
          </p>
          {billing?.subscriptionStatus ? (
            <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
              <span className="font-semibold text-[var(--color-text)]">
                {t("app.settings.subscriptionStatus")}
              </span>{" "}
              {billing.subscriptionStatus}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {requiresBillingManagement ? (
            <button
              type="button"
              onClick={openPortal}
              className="btn-primary"
              disabled={busyAction !== null}
            >
              {busyAction === "portal" ? t("app.settings.opening") : t("app.settings.manageBilling")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startCheckout("pro_monthly")}
              className="btn-primary"
              disabled={busyAction !== null || !planAvailability.pro_monthly}
            >
              {busyAction === "pro_monthly" ? t("app.settings.opening") : t("app.settings.startPro")}
            </button>
          )}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="btn-secondary"
            disabled={busyAction !== null}
          >
            {t("app.signOut")}
          </button>
        </div>

        {!requiresBillingManagement ? (
          <p className="mt-4 text-xs leading-5 text-[var(--color-text-secondary)]">
            {t("app.billingStart.trialNote")}
          </p>
        ) : (
          <p className="mt-4 text-xs leading-5 text-[var(--color-text-secondary)]">
            {t("app.billingStart.portalNote")}
          </p>
        )}

        {billingSuccess ? (
          <p className="mt-4 text-sm text-[var(--color-accent)]">
            {t("app.settings.checkoutSuccess")}
          </p>
        ) : null}
        {billingError ? (
          <p className="mt-4 text-sm text-[var(--color-danger)]">{billingError}</p>
        ) : null}

        <p className="mt-6 text-xs leading-5 text-[var(--color-text-secondary)]">
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

        {PADDLE_CLIENT_TOKEN ? (
          <Script
            src={PADDLE_SCRIPT_SRC}
            strategy="afterInteractive"
            onLoad={() => {
              if (initializePaddleForBilling(successUrl)) {
                setPaddleReady(true);
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
