import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { NextResponse } from "next/server";
import { getPaddleClient, getPaddleForwardSecret, getPaddleWebhookSecret } from "@/lib/paddle";

const api = anyApi;

type SubscriptionSnapshot = {
  subscriptionId?: string;
  customerId?: string;
  subscriptionStatus?: string;
  priceId?: string;
  productId?: string;
  currentPeriodStartsAt?: string;
  currentPeriodEndsAt?: string;
  nextBilledAt?: string;
  canceledAt?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function getStringValue(record: Record<string, unknown> | null, key: string) {
  if (!record) return undefined;
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function extractSubscriptionSnapshot(data: unknown): SubscriptionSnapshot {
  const root = asRecord(data);
  const currentBillingPeriod = asRecord(root?.currentBillingPeriod);
  const firstItem = Array.isArray(root?.items) ? asRecord(root.items[0]) : null;
  const price = asRecord(firstItem?.price);
  const product = asRecord(firstItem?.product);

  return {
    subscriptionId: getStringValue(root, "id") ?? getStringValue(root, "subscriptionId"),
    customerId: getStringValue(root, "customerId"),
    subscriptionStatus: getStringValue(root, "status"),
    priceId: getStringValue(price, "id"),
    productId: getStringValue(product, "id") ?? getStringValue(price, "productId"),
    currentPeriodStartsAt: getStringValue(currentBillingPeriod, "startsAt"),
    currentPeriodEndsAt: getStringValue(currentBillingPeriod, "endsAt"),
    nextBilledAt: getStringValue(root, "nextBilledAt"),
    canceledAt: getStringValue(root, "canceledAt"),
  };
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("paddle-signature");
    if (!signature) {
      return NextResponse.json(
        { error: "Missing paddle-signature header" },
        { status: 400 },
      );
    }

    const rawBody = await request.text();
    const paddle = getPaddleClient();
    const webhookSecret = getPaddleWebhookSecret();
    const event = await paddle.webhooks.unmarshal(rawBody, webhookSecret, signature);

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_CONVEX_URL" },
        { status: 500 },
      );
    }

    const snapshot = extractSubscriptionSnapshot(event.data);
    const convex = new ConvexHttpClient(convexUrl);

    await convex.mutation(api.billing.processPaddleWebhook, {
      forwardSecret: getPaddleForwardSecret(),
      eventId: event.eventId,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      rawBody,
      subscriptionId: snapshot.subscriptionId,
      customerId: snapshot.customerId,
      subscriptionStatus: snapshot.subscriptionStatus,
      priceId: snapshot.priceId,
      productId: snapshot.productId,
      currentPeriodStartsAt: snapshot.currentPeriodStartsAt,
      currentPeriodEndsAt: snapshot.currentPeriodEndsAt,
      nextBilledAt: snapshot.nextBilledAt,
      canceledAt: snapshot.canceledAt,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
