import { randomUUID } from "crypto";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { type BillingPlan } from "@/lib/billing-plans";
import { authOptions } from "@/lib/auth";
import { getPaddlePriceId } from "@/lib/paddle";

const api = anyApi;
const DAY_MS = 86_400_000;

const statusSchema = z.enum([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
]);
const planSchema = z.enum([
  "pro_monthly",
  "pro_yearly",
  "pro_plus_monthly",
  "pro_plus_yearly",
]);

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("state"),
  }),
  z.object({
    action: z.literal("reset"),
  }),
  z.object({
    action: z.literal("backdateTrial"),
    daysAgo: z.number().int().min(0).max(3650),
  }),
  z.object({
    action: z.literal("simulateWebhook"),
    status: statusSchema,
    plan: planSchema.default("pro_monthly"),
    eventType: z.string().trim().min(1).optional(),
    occurredAtOffsetDays: z.number().int().min(-3650).max(3650).optional(),
    subscriptionUpdatedAtOffsetDays: z.number().int().min(-3650).max(3650).optional(),
    currentPeriodEndsInDays: z.number().int().min(-3650).max(3650).optional(),
    nextBilledInDays: z.number().int().min(-3650).max(3650).optional(),
    subscriptionId: z.string().trim().min(2).max(120).optional(),
  }),
]);

type SyncUserResult = {
  externalId: string;
  paddleCustomerId: string | null;
};

type BillingState = {
  isActive?: boolean;
  trialActive?: boolean;
  plan?: "free" | "pro" | "pro_plus";
  subscriptionStatus?: string | null;
  paddleCustomerId?: string | null;
  paddleSubscriptionId?: string | null;
  paddlePriceId?: string | null;
};

function getTestSecretFromRequest(request: Request) {
  const expected = process.env.E2E_TEST_SECRET?.trim();
  const provided = request.headers.get("x-e2e-secret")?.trim();
  if (!expected || provided !== expected) return null;
  return expected;
}

function resolveDefaultEventType(status: z.infer<typeof statusSchema>) {
  switch (status) {
    case "trialing":
      return "subscription.trialing";
    case "active":
      return "subscription.activated";
    case "past_due":
      return "subscription.past_due";
    case "canceled":
      return "subscription.canceled";
    case "expired":
      return "subscription.updated";
    default:
      return "subscription.updated";
  }
}

function sanitizeExternalId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
}

function offsetIso(daysOffset: number) {
  return new Date(Date.now() + daysOffset * DAY_MS).toISOString();
}

function getPriceIdForPlan(plan: BillingPlan) {
  try {
    return getPaddlePriceId(plan);
  } catch {
    // Test fallback in case env price IDs are not configured.
    return `price_test_${plan}`;
  }
}

function getConvexClient(convexToken: string) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
  }
  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(convexToken);
  return convex;
}

async function getState(convex: ConvexHttpClient, testSecret: string) {
  const billing = (await convex.query(api.billing.getMyBilling, {})) as BillingState;
  const snapshot = await convex.query(api.billing.getMySubscriptionSnapshotForTesting, {
    testSecret,
  });
  return { billing, snapshot };
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Disabled in production" }, { status: 403 });
    }
    const testSecret = getTestSecretFromRequest(request);
    if (!testSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.convexToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let parsed: z.infer<typeof actionSchema>;
    try {
      parsed = actionSchema.parse(await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const convex = getConvexClient(session.convexToken);
    const user = (await convex.mutation(api.billing.syncCurrentUser, {})) as SyncUserResult;

    if (parsed.action === "state") {
      return NextResponse.json(await getState(convex, testSecret));
    }

    if (parsed.action === "reset") {
      await convex.mutation(api.billing.resetMyBillingForTesting, { testSecret });
      return NextResponse.json(await getState(convex, testSecret));
    }

    if (parsed.action === "backdateTrial") {
      const createdAt = Date.now() - parsed.daysAgo * DAY_MS;
      await convex.mutation(api.billing.setMyCreatedAtForTesting, {
        testSecret,
        createdAt,
      });
      return NextResponse.json(await getState(convex, testSecret));
    }

    const preState = await getState(convex, testSecret);
    let customerId = preState.billing?.paddleCustomerId ?? null;
    if (!customerId) {
      customerId = `ctm_test_${sanitizeExternalId(user.externalId)}`;
      await convex.mutation(api.billing.setMyPaddleCustomerId, {
        testSecret,
        customerId,
      });
    }

    const subscriptionId =
      parsed.subscriptionId ??
      preState.billing?.paddleSubscriptionId ??
      `sub_test_${sanitizeExternalId(user.externalId)}`;
    const priceId = getPriceIdForPlan(parsed.plan);
    const occurredAt = offsetIso(parsed.occurredAtOffsetDays ?? 0);
    const subscriptionUpdatedAt =
      parsed.subscriptionUpdatedAtOffsetDays === undefined
        ? occurredAt
        : offsetIso(parsed.subscriptionUpdatedAtOffsetDays);

    await convex.mutation(api.billing.processPaddleWebhook, {
      testSecret,
      eventId: `evt_test_${randomUUID()}`,
      eventType: parsed.eventType ?? resolveDefaultEventType(parsed.status),
      occurredAt,
      subscriptionUpdatedAt,
      subscriptionId,
      customerId,
      subscriptionStatus: parsed.status,
      priceId,
      productId: "prod_test_plan",
      currentPeriodStartsAt: offsetIso(-1),
      currentPeriodEndsAt: offsetIso(parsed.currentPeriodEndsInDays ?? 29),
      nextBilledAt: offsetIso(parsed.nextBilledInDays ?? 29),
      canceledAt: parsed.status === "canceled" ? occurredAt : undefined,
      rawBody: JSON.stringify({
        source: "api-test-billing",
        status: parsed.status,
        plan: parsed.plan,
      }),
    });

    return NextResponse.json(await getState(convex, testSecret));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
