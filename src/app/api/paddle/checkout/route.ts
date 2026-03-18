import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { parseBillingPlan } from "@/lib/billing-plans";
import { createPaddleCheckoutToken } from "@/lib/paddle-checkout-token";

const api = anyApi;

type SyncUserResult = {
  externalId: string;
};

type BillingState = {
  isActive?: boolean;
  subscriptionStatus?: string | null;
  paddleCustomerId?: string | null;
  paddleSubscriptionId?: string | null;
  blockingSubscriptionIds?: string[] | null;
};

function shouldBlockNewCheckout(billing: BillingState | null | undefined) {
  if (billing?.isActive) {
    return {
      code: "active_subscription_exists",
      error: "An active subscription already exists for this account. Use Manage billing to change plan.",
    };
  }

  if (Array.isArray(billing?.blockingSubscriptionIds) && billing.blockingSubscriptionIds.length > 0) {
    return {
      code: "subscription_requires_portal",
      error:
        "An existing subscription already exists for this account. Use Manage billing to update or recover it.",
    };
  }

  return null;
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
    if (!session.user?.email) {
      return NextResponse.json(
        { error: "Missing user email in session" },
        { status: 400 },
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

    const user = (await convex.mutation(
      api.billing.syncCurrentUser,
      {},
    )) as SyncUserResult;

    const billing = (await convex.query(api.billing.getMyBilling, {})) as BillingState;
    const checkoutBlock = shouldBlockNewCheckout(billing);
    if (checkoutBlock) {
      return NextResponse.json(
        {
          error: checkoutBlock.error,
          code: checkoutBlock.code,
          paddleSubscriptionId: billing.paddleSubscriptionId ?? null,
          blockingSubscriptionIds: billing.blockingSubscriptionIds ?? [],
          subscriptionStatus: billing.subscriptionStatus ?? null,
        },
        { status: 409 },
      );
    }

    const planConfig = (await convex.query(api.billing.getCheckoutPlanConfig, {
      plan,
    })) as { priceId: string | null; checkoutEnabled: boolean };
    if (!planConfig.checkoutEnabled || !planConfig.priceId) {
      return NextResponse.json(
        { error: `Checkout is not configured for ${plan}` },
        { status: 503 },
      );
    }

    return NextResponse.json({
      priceId: planConfig.priceId,
      customerEmail: session.user.email,
      paddleCustomerId: billing?.paddleCustomerId ?? null,
      checkoutToken: createPaddleCheckoutToken(user.externalId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
