import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { NextResponse } from "next/server";
import { getPaddleClient, getPaddleForwardSecret, getPaddleWebhookSecret } from "@/lib/paddle";
import { verifyPaddleCheckoutToken } from "@/lib/paddle-checkout-token";

const api = anyApi;

type SubscriptionSnapshot = {
  subscriptionId?: string;
  customerId?: string;
  checkoutToken?: string;
  externalId?: string;
  subscriptionUpdatedAt?: string;
  subscriptionStatus?: string;
  priceId?: string;
  productId?: string;
  currentPeriodStartsAt?: string | null;
  currentPeriodEndsAt?: string | null;
  nextBilledAt?: string | null;
  canceledAt?: string | null;
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

function getStringOrNullValue(record: Record<string, unknown> | null, key: string) {
  if (!record || !(key in record)) return undefined;
  const value = record[key];
  if (value === null) return null;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function extractSubscriptionSnapshot(data: unknown): SubscriptionSnapshot {
  const root = asRecord(data);
  const currentBillingPeriodRaw = root?.currentBillingPeriod;
  const currentBillingPeriod = asRecord(currentBillingPeriodRaw);
  const customData = asRecord(root?.customData);
  const firstItem = Array.isArray(root?.items) ? asRecord(root.items[0]) : null;
  const price = asRecord(firstItem?.price);
  const product = asRecord(firstItem?.product);

  return {
    subscriptionId: getStringValue(root, "subscriptionId") ?? getStringValue(root, "id"),
    customerId: getStringValue(root, "customerId"),
    checkoutToken: getStringValue(customData, "checkoutToken"),
    externalId: getStringValue(customData, "externalId"),
    subscriptionUpdatedAt: getStringValue(root, "updatedAt"),
    subscriptionStatus: getStringValue(root, "status"),
    priceId: getStringValue(price, "id"),
    productId: getStringValue(product, "id") ?? getStringValue(price, "productId"),
    currentPeriodStartsAt:
      currentBillingPeriodRaw === null
        ? null
        : getStringOrNullValue(currentBillingPeriod, "startsAt"),
    currentPeriodEndsAt:
      currentBillingPeriodRaw === null
        ? null
        : getStringOrNullValue(currentBillingPeriod, "endsAt"),
    nextBilledAt: getStringOrNullValue(root, "nextBilledAt"),
    canceledAt: getStringOrNullValue(root, "canceledAt"),
  };
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("paddle-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing paddle-signature header" },
      { status: 400 },
    );
  }

  const rawBody = await request.text();

  let event: {
    eventId: string;
    eventType: string;
    occurredAt?: string;
    data: unknown;
  };

  try {
    const paddle = getPaddleClient();
    const webhookSecret = getPaddleWebhookSecret();
    event = await paddle.webhooks.unmarshal(rawBody, webhookSecret, signature);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    if (!event.eventType.startsWith("subscription.")) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_CONVEX_URL" },
        { status: 500 },
      );
    }

    const snapshot = extractSubscriptionSnapshot(event.data);
    const verifiedExternalId = snapshot.checkoutToken
      ? verifyPaddleCheckoutToken(snapshot.checkoutToken)
      : snapshot.externalId;
    const convex = new ConvexHttpClient(convexUrl);

    await convex.mutation(api.billing.processPaddleWebhook, {
      forwardSecret: getPaddleForwardSecret(),
      eventId: event.eventId,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      rawBody,
      subscriptionId: snapshot.subscriptionId,
      customerId: snapshot.customerId,
      externalId: verifiedExternalId ?? undefined,
      subscriptionUpdatedAt: snapshot.subscriptionUpdatedAt,
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
    const message = error instanceof Error ? error.message : "Internal webhook error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
