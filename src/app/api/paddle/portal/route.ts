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

    const billing = (await convex.query(api.billing.getMyBilling, {})) as BillingState;
    if (!billing.paddleCustomerId) {
      return NextResponse.json(
        { error: "No Paddle customer found for this account" },
        { status: 400 },
      );
    }

    const paddle = getPaddleClient();
    const subscriptionIds = billing.paddleSubscriptionId
      ? [billing.paddleSubscriptionId]
      : [];

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
