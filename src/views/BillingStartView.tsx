"use client";

import { anyApi } from "convex/server";
import { useQuery } from "convex/react";
import Link from "next/link";
import Script from "next/script";
import { useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import {
  abandonCheckoutSession,
  initializePaddleForBilling,
  setActiveCheckoutSession,
} from "@/lib/paddle-checkout-client";
import { getPublicPaddleClientToken } from "@/lib/paddle-client";
import { openBillingPortal } from "@/lib/paddle-portal-client";
import { sanitizeInternalReturnPath } from "@/lib/return-path";

const api = anyApi;
type CheckoutPlan = "pro_monthly";
type BusyAction = CheckoutPlan | "portal";
type BillingState = {
  isActive?: boolean;
  trialActive?: boolean;
  checkoutPendingConfirmation?: boolean;
  accessEndsAt?: number | null;
  // "inactive" is a locked state, not a usable free tier.
  plan?: "inactive" | "pro" | "pro_plus";
  accessSource?: "none" | "manual" | "subscription" | "subscription_trial";
  subscriptionStatus?: string | null;
  paddleCustomerId?: string | null;
  paddleSubscriptionId?: string | null;
  paddleSubscriptionIds?: string[] | null;
  billingPortalAvailable?: boolean;
  billingPortalSubscriptionIds?: string[] | null;
  blockingSubscriptionIds?: string[] | null;
  trialEndsAt?: number | null;
  manualAccessTier?: string | null;
  merchantReviewRequired?: boolean;
  merchantReviewCaseId?: string | null;
};
type CheckoutPlanOffer = {
  plan?: CheckoutPlan;
  trialEligible?: boolean;
  trialDays?: number;
  checkoutEnabled?: boolean;
};
type CheckoutPayload = {
  priceId?: string;
  customerEmail?: string | null;
  paddleCustomerId?: string | null;
  checkoutSessionId?: string;
  checkoutToken?: string;
  error?: string;
};

const PADDLE_SCRIPT_SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";
const PADDLE_CLIENT_TOKEN = getPublicPaddleClientToken();

export default function BillingStartView() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const billing = useQuery(api.billing.getMyBilling) as BillingState | undefined;
  const checkoutOffer = useQuery(api.billing.getMyCheckoutPlanConfig, {
    plan: "pro_monthly",
  }) as CheckoutPlanOffer | undefined;
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [paddleReady, setPaddleReady] = useState(false);
  const from = sanitizeInternalReturnPath(searchParams.get("from"));
  const billingSuccess = searchParams.get("billing") === "success";
  const hasManualAccess = billing?.accessSource === "manual" || Boolean(billing?.manualAccessTier);
  const hasBlockingSubscriptions = (billing?.blockingSubscriptionIds?.length ?? 0) > 0;
  const merchantReviewRequired = Boolean(billing?.merchantReviewRequired);
  const checkoutPendingConfirmation = Boolean(billing?.checkoutPendingConfirmation);
  const billingPortalAvailable = Boolean(billing?.billingPortalAvailable);
  const requiresBillingPortal = Boolean(
    billingPortalAvailable &&
      (billing?.isActive || merchantReviewRequired || hasBlockingSubscriptions),
  );
  const requiresSupport =
    !requiresBillingPortal &&
    (hasManualAccess ||
      merchantReviewRequired ||
      (!billing?.isActive && hasBlockingSubscriptions));
  const trialEndsAt = typeof billing?.trialEndsAt === "number" ? billing.trialEndsAt : null;
  const trialDaysLeft =
    trialEndsAt === null ? 0 : Math.max(0, Math.ceil((trialEndsAt - Date.now()) / 86_400_000));
  const trialDays = Math.max(0, Math.floor(checkoutOffer?.trialDays ?? 0));
  const trialEligible = Boolean(checkoutOffer?.trialEligible) && trialDays > 0;
  const checkoutEnabled = checkoutOffer?.checkoutEnabled ?? true;
  const checkoutUnavailable = !requiresSupport && !checkoutEnabled;
  const startButtonLabel =
    trialEligible ? t("app.settings.startPro") : t("app.settings.startProNoTrial");
  const billingNote =
    trialEligible ? t("app.billingStart.trialNote") : t("app.billingStart.trialNoteNoTrial");
  const successUrl =
    typeof window === "undefined"
      ? `/start-trial?billing=success&from=${encodeURIComponent(from)}`
      : `${window.location.origin}/start-trial?billing=success&from=${encodeURIComponent(from)}`;

  useEffect(() => {
    if (!PADDLE_CLIENT_TOKEN) return;
    if (initializePaddleForBilling(successUrl)) {
      setPaddleReady(true);
    }
  }, [successUrl]);

  async function startCheckout(plan: CheckoutPlan) {
    setBillingError(null);
    setBusyAction(plan);
    let checkoutSessionId: string | null = null;
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
      if (
        !response.ok ||
        !payload.priceId ||
        !payload.checkoutSessionId ||
        (!payload.paddleCustomerId && !payload.customerEmail)
      ) {
        throw new Error(payload.error ?? "Failed to create Paddle checkout");
      }
      checkoutSessionId = payload.checkoutSessionId;
      const open = window.Paddle?.Checkout?.open;
      if (typeof open !== "function") {
        await abandonCheckoutSession(checkoutSessionId);
        throw new Error(t("app.settings.checkoutDidNotLoad"));
      }
      const customer = payload.paddleCustomerId
        ? { id: payload.paddleCustomerId }
        : { email: payload.customerEmail ?? undefined };
      setActiveCheckoutSession(checkoutSessionId);
      try {
        open({
          items: [{ priceId: payload.priceId, quantity: 1 }],
          customer,
          customData: {
            checkoutSessionId,
            ...(payload.checkoutToken ? { checkoutToken: payload.checkoutToken } : {}),
          },
        });
      } catch (error) {
        await abandonCheckoutSession(checkoutSessionId);
        throw error;
      }
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePrimaryBillingAction() {
    if (requiresBillingPortal) {
      setBillingError(null);
      setBusyAction("portal");
      try {
        await openBillingPortal();
      } catch (error) {
        setBillingError(error instanceof Error ? error.message : "Billing portal failed");
      } finally {
        setBusyAction(null);
      }
      return;
    }
    if (requiresSupport || checkoutUnavailable) {
      window.location.href = "/contact";
      return;
    }
    await startCheckout("pro_monthly");
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-3xl items-center justify-center px-4 py-8">
      <div className="card-surface w-full max-w-2xl p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-accent)]">
          aiankipro
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          {requiresBillingPortal || requiresSupport
            ? t("app.billingStart.titleManage")
            : trialEligible
              ? t("app.billingStart.titleStart")
              : t("app.billingStart.titleStartNoTrial")}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--color-text-secondary)]">
          {requiresBillingPortal
            ? t("app.billingStart.subtitleManage")
            : requiresSupport
              ? t("app.billingStart.subtitleSupport")
            : trialEligible
              ? t("app.billingStart.subtitleStart", { count: trialDays })
              : t("app.billingStart.subtitleStartNoTrial")}
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
          <button
            type="button"
            onClick={handlePrimaryBillingAction}
            className="btn-primary"
            disabled={
              busyAction !== null ||
              checkoutPendingConfirmation ||
              (!requiresBillingPortal && !requiresSupport && !checkoutEnabled)
            }
          >
            {busyAction !== null || checkoutPendingConfirmation
              ? t("app.settings.opening")
              : requiresBillingPortal
                ? t("app.settings.manageBilling")
                : requiresSupport || checkoutUnavailable
                  ? t("app.settings.contactSupport")
                  : startButtonLabel}
          </button>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="btn-secondary"
            disabled={busyAction !== null}
          >
            {t("app.signOut")}
          </button>
        </div>

        {checkoutPendingConfirmation ? (
          <p className="mt-4 text-xs leading-5 text-[var(--color-text-secondary)]">
            {t("app.settings.checkoutSuccess")}
          </p>
        ) : requiresBillingPortal ? (
          <p className="mt-4 text-xs leading-5 text-[var(--color-text-secondary)]">
            {t("app.billingStart.portalNote")}
          </p>
        ) : checkoutUnavailable ? (
          <p className="mt-4 text-xs leading-5 text-[var(--color-text-secondary)]">
            {t("app.settings.checkoutUnavailable")}. {t("app.billingStart.supportNote")}
          </p>
        ) : merchantReviewRequired ? (
          <p className="mt-4 text-xs leading-5 text-[var(--color-text-secondary)]">
            {t("app.billingStart.merchantReviewNote")}
          </p>
        ) : !hasBlockingSubscriptions ? (
          <p className="mt-4 text-xs leading-5 text-[var(--color-text-secondary)]">
            {billingNote}
          </p>
        ) : requiresSupport ? (
          <p className="mt-4 text-xs leading-5 text-[var(--color-text-secondary)]">
            {t("app.billingStart.supportNote")}
          </p>
        ) : null}

        {billingSuccess && (Boolean(billing?.isActive) || checkoutPendingConfirmation) ? (
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
