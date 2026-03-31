import { randomBytes } from "crypto";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { parseBillingPlan } from "@/lib/billing-plans";
import { createPaddleCheckoutToken } from "@/lib/paddle-checkout-token";
import { priceHasExpectedTrial } from "@/lib/paddle";

const api = anyApi;

type BillingState = {
  isActive?: boolean;
  accessSource?: "none" | "manual" | "subscription" | "subscription_trial";
  manualAccessTier?: string | null;
  checkoutPendingConfirmation?: boolean;
  subscriptionStatus?: string | null;
  paddleCustomerId?: string | null;
  paddleSubscriptionId?: string | null;
  blockingSubscriptionIds?: string[] | null;
  portalManagementAvailable?: boolean;
  merchantReviewRequired?: boolean;
  merchantReviewCaseId?: string | null;
};

function shouldBlockNewCheckout(billing: BillingState | null | undefined) {
  if (billing?.isActive) {
    return {
      code:
        billing?.accessSource === "manual" || billing?.manualAccessTier
          ? "manual_access_active"
          : "active_subscription_exists",
      error:
        billing?.accessSource === "manual" || billing?.manualAccessTier
          ? "This account currently has complimentary access. Contact support if you need to change billing for it."
          : "Active access already exists for this account. Use Manage billing if you need to change it.",
    };
  }

  if (billing?.merchantReviewRequired && !billing.portalManagementAvailable) {
    return {
      code: "subscription_requires_support",
      error:
        "This account has a billing issue that needs manual review before checkout can continue. Open support from the app so we can reconnect it safely.",
    };
  }

  if (
    Array.isArray(billing?.blockingSubscriptionIds) &&
    billing.blockingSubscriptionIds.length > 0 &&
    !billing?.portalManagementAvailable
  ) {
    return {
      code: "subscription_requires_support",
      error:
        "This account has multiple billing records that need manual review before checkout can continue. Open support from the app so we can reconnect the right subscription safely.",
    };
  }

  if (Array.isArray(billing?.blockingSubscriptionIds) && billing.blockingSubscriptionIds.length > 0) {
    return {
      code: "subscription_requires_portal",
      error:
        "An existing subscription already exists for this account. Use Manage billing to update or recover it.",
    };
  }

  if (billing?.checkoutPendingConfirmation) {
    return {
      code: "checkout_pending_confirmation",
      error:
        "Your purchase is still being confirmed. Please wait a moment before trying checkout again.",
    };
  }

  return null;
}

function createCheckoutSessionId() {
  return `pcs_${randomBytes(24).toString("hex")}`;
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!session.convexToken) {
      return NextResponse.json(
        { error: "Missing Convex auth token in session" },
        { status: 401 },
      );
    }
    const body = (await request.json()) as { plan?: unknown };
    const plan = parseBillingPlan(body.plan);
    if (!plan || plan !== "pro_monthly") {
      return NextResponse.json(
        {
          error:
            "Invalid plan. Expected: 'pro_monthly'.",
        },
        { status: 400 },
      );
    }
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_CONVEX_URL" },
        { status: 500 },
      );
    }

    const convex = new ConvexHttpClient(convexUrl);
    convex.setAuth(session.convexToken);

    const user = (await convex.mutation(api.billing.syncCurrentUser, {})) as {
      externalId: string;
    };

    const billing = (await convex.query(api.billing.getMyBilling, {})) as BillingState;
    const checkoutBlock = shouldBlockNewCheckout(billing);
    if (checkoutBlock) {
      return NextResponse.json(
        {
          error: checkoutBlock.error,
          code: checkoutBlock.code,
          paddleSubscriptionId: billing.paddleSubscriptionId ?? null,
          blockingSubscriptionIds: billing.blockingSubscriptionIds ?? [],
          merchantReviewCaseId: billing.merchantReviewCaseId ?? null,
          subscriptionStatus: billing.subscriptionStatus ?? null,
        },
        { status: 409 },
      );
    }

    const planConfig = (await convex.query(api.billing.getMyCheckoutPlanConfig, {
      plan,
    })) as {
      priceId: string | null;
      checkoutEnabled: boolean;
      trialEligible: boolean;
      trialDays: number;
    };
    if (!planConfig.checkoutEnabled || !planConfig.priceId) {
      return NextResponse.json(
        {
          error:
            planConfig.trialEligible
              ? `Checkout is not configured for ${plan}`
              : "Returning Pro checkout is temporarily unavailable because billing is misconfigured.",
        },
        { status: 503 },
      );
    }

    if (!billing?.paddleCustomerId && !session.user?.email) {
      return NextResponse.json(
        { error: "Missing user email for first-time checkout" },
        { status: 400 },
      );
    }

    const expectedTrialDays = planConfig.trialEligible ? planConfig.trialDays : 0;
    if (!(await priceHasExpectedTrial(planConfig.priceId, expectedTrialDays))) {
      return NextResponse.json(
        {
          error:
            planConfig.trialEligible
              ? "The Pro trial is temporarily unavailable because billing is misconfigured. Please try again later."
              : "Returning Pro checkout is temporarily unavailable because billing is misconfigured. Please try again later.",
        },
        { status: 503 },
      );
    }

    const checkoutSessionId = createCheckoutSessionId();
    try {
      await convex.mutation(api.billing.createCheckoutSession, {
        sessionId: checkoutSessionId,
        plan,
        priceId: planConfig.priceId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("Checkout already in progress")) {
        return NextResponse.json(
          {
            error:
              "A checkout is already in progress for this account. Please finish it or wait a few minutes before trying again.",
            code: "checkout_in_progress",
          },
          { status: 409 },
        );
      }
      if (message.includes("Active access already exists")) {
        return NextResponse.json(
          {
            error:
              "Active access already exists for this account. Use Manage billing if you need to change it.",
            code: "active_subscription_exists",
          },
          { status: 409 },
        );
      }
      if (message.includes("complimentary access")) {
        return NextResponse.json(
          {
            error:
              "This account currently has complimentary access. Contact support if you need to change billing for it.",
            code: "manual_access_active",
          },
          { status: 409 },
        );
      }
      if (message.includes("Subscription requires billing management")) {
        return NextResponse.json(
          {
            error:
              "An existing subscription already exists for this account. Use Manage billing to update or recover it.",
            code: "subscription_requires_portal",
          },
          { status: 409 },
        );
      }
      if (message.includes("Subscription requires merchant review")) {
        return NextResponse.json(
          {
            error:
              "This account has a billing issue that needs manual review before checkout can continue. Open support from the app so we can reconnect it safely.",
            code: "subscription_requires_support",
          },
          { status: 409 },
        );
      }
      if (message.includes("Checkout confirmation pending")) {
        return NextResponse.json(
          {
            error:
              "Your purchase is still being confirmed. Please wait a moment before trying checkout again.",
            code: "checkout_pending_confirmation",
          },
          { status: 409 },
        );
      }
      throw error;
    }

    return NextResponse.json({
      priceId: planConfig.priceId,
      customerEmail: session.user?.email ?? null,
      paddleCustomerId: billing?.paddleCustomerId ?? null,
      checkoutSessionId,
      checkoutToken: createPaddleCheckoutToken(user.externalId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
