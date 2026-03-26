import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getPaddleClient } from "@/lib/paddle";

const api = anyApi;

type BillingState = {
  paddleCustomerId: string | null;
  paddleSubscriptionId: string | null;
  paddleSubscriptionIds?: string[] | null;
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
    if (!billing.paddleCustomerId) {
      return NextResponse.json(
        { error: "No Paddle customer found for this account" },
        { status: 400 },
      );
    }

    const paddle = getPaddleClient();
    const subscriptionIds =
      Array.isArray(billing.paddleSubscriptionIds) && billing.paddleSubscriptionIds.length > 0
        ? billing.paddleSubscriptionIds
        : billing.paddleSubscriptionId
          ? [billing.paddleSubscriptionId]
          : [];
    if (subscriptionIds.length === 0) {
      return NextResponse.json(
        { error: "No Paddle subscriptions found for this account" },
        { status: 409 },
      );
    }

    const portalSession = await paddle.customerPortalSessions.create(
      billing.paddleCustomerId,
      subscriptionIds,
    );
    return NextResponse.json({ portalUrl: portalSession.urls.general.overview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
