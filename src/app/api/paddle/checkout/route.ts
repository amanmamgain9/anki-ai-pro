import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { parseBillingPlan } from "@/lib/billing-plans";
import {
  getPaddleClient,
  getPaddleForwardSecret,
  getPaddlePriceId,
} from "@/lib/paddle";

const api = anyApi;

type SyncUserResult = {
  externalId: string;
  paddleCustomerId: string | null;
};

type BillingState = {
  isActive?: boolean;
  paddleSubscriptionId?: string | null;
};

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
    if (!plan) {
      return NextResponse.json(
        {
          error:
            "Invalid plan. Expected one of: 'pro_monthly', 'pro_yearly', 'pro_plus_monthly', 'pro_plus_yearly'.",
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
    if (billing?.isActive) {
      return NextResponse.json(
        {
          error:
            "An active subscription already exists for this account. Use Manage billing to change plan.",
          code: "active_subscription_exists",
          paddleSubscriptionId: billing.paddleSubscriptionId ?? null,
        },
        { status: 409 },
      );
    }

    const priceId = getPaddlePriceId(plan);
    const paddle = getPaddleClient();
    let customerId = user.paddleCustomerId;
    if (!customerId) {
      const customer = await paddle.customers.create({
        email: session.user.email,
        name: session.user.name ?? undefined,
        customData: {
          externalId: user.externalId,
        },
      });
      customerId = customer.id;
      await convex.mutation(api.billing.setMyPaddleCustomerId, {
        forwardSecret: getPaddleForwardSecret(),
        customerId,
      });
    }

    const returnBaseUrl =
      process.env.NEXTAUTH_URL?.replace(/\/+$/, "") ?? "http://localhost:3000";

    const transaction = await paddle.transactions.create({
      items: [{ priceId, quantity: 1 }],
      customerId,
      customData: {
        externalId: user.externalId,
      },
      checkout: {
        url: `${returnBaseUrl}/settings?billing=success`,
      },
    });

    const checkoutUrl = transaction.checkout?.url;
    if (!checkoutUrl) {
      return NextResponse.json(
        { error: "Paddle transaction did not return a checkout URL" },
        { status: 502 },
      );
    }

    return NextResponse.json({ checkoutUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
