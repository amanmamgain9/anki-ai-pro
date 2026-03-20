import { verifyPaddleCheckoutToken } from "@/lib/paddle-checkout-token";

export type PaddleWebhookEventLike = {
  eventId: string;
  eventType: string;
  occurredAt?: string;
  data: unknown;
};

export type PaddleWebhookMutationArgs = {
  eventId: string;
  eventType: string;
  occurredAt?: string;
  checkoutSessionId?: string;
  subscriptionId?: string;
  customerId?: string;
  externalId?: string;
  subscriptionUpdatedAt?: string;
  subscriptionStatus?: string;
  priceId?: string;
  productId?: string;
  currentPeriodStartsAt?: string | null;
  currentPeriodEndsAt?: string | null;
  nextBilledAt?: string | null;
  canceledAt?: string | null;
  rawBody?: string;
};

type SubscriptionSnapshot = {
  checkoutSessionId?: string;
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

export function extractSubscriptionSnapshot(data: unknown): SubscriptionSnapshot {
  const root = asRecord(data);
  const currentBillingPeriodRaw = root?.currentBillingPeriod;
  const currentBillingPeriod = asRecord(currentBillingPeriodRaw);
  const customData = asRecord(root?.customData);
  const firstItem = Array.isArray(root?.items) ? asRecord(root.items[0]) : null;
  const price = asRecord(firstItem?.price);
  const product = asRecord(firstItem?.product);

  return {
    checkoutSessionId: getStringValue(customData, "checkoutSessionId"),
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

export function buildPaddleWebhookMutationArgs(
  event: PaddleWebhookEventLike,
  rawBody?: string,
): PaddleWebhookMutationArgs | null {
  if (!event.eventType.startsWith("subscription.")) {
    return null;
  }
  const snapshot = extractSubscriptionSnapshot(event.data);
  const verifiedExternalId = snapshot.checkoutSessionId
    ? undefined
    : snapshot.checkoutToken
      ? verifyPaddleCheckoutToken(snapshot.checkoutToken)
      : snapshot.externalId;

  return {
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    rawBody,
    checkoutSessionId: snapshot.checkoutSessionId,
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
  };
}
