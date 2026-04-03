import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getPaddleClient } from "@/lib/paddle";

const api = anyApi;

type BillingState = {
  billingPortalAvailable?: boolean;
  billingPortalSubscriptionIds?: string[] | null;
  paddleCustomerId?: string | null;
  manualAccessTier?: string | null;
  accessSource?: "none" | "manual" | "subscription" | "subscription_trial";
};

export const runtime = "nodejs";

export async function POST() {
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

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_CONVEX_URL" },
        { status: 500 },
      );
    }

    const convex = new ConvexHttpClient(convexUrl);
    convex.setAuth(session.convexToken);
    await convex.mutation(api.billing.syncCurrentUser, {});
    const billing = (await convex.query(api.billing.getMyBilling, {})) as BillingState;
    const customerId =
      typeof billing?.paddleCustomerId === "string" && billing.paddleCustomerId.length > 0
        ? billing.paddleCustomerId
        : null;
    const subscriptionIds = Array.isArray(billing?.billingPortalSubscriptionIds)
      ? billing.billingPortalSubscriptionIds.filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        )
      : [];

    if (!billing?.billingPortalAvailable || !customerId || subscriptionIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "Billing management is unavailable for this account. Contact support if you need help.",
        },
        { status: 409 },
      );
    }

    const portalSession = await getPaddleClient().customerPortalSessions.create(
      customerId,
      subscriptionIds,
    );

    return NextResponse.json({
      url: portalSession.urls.general.overview,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
