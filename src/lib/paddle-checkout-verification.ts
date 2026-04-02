import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { Session } from "next-auth";
import { getPaddleClient } from "@/lib/paddle";

const api = anyApi;

function getStringCustomDataValue(
  customData: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = customData?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function verifyAndRecordCheckoutCompletion(
  session: Session,
  {
    sessionId,
    transactionId,
  }: {
    sessionId: string;
    transactionId: string;
  },
) {
  if (!session.convexToken) {
    throw new Error("Missing Convex auth token in session");
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
  }

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(session.convexToken);
  const checkoutSession = await convex.query(api.billing.getCheckoutSessionVerificationContext, {
    sessionId,
  });
  if (!checkoutSession) {
    throw new Error("Checkout session not found");
  }

  const transaction = await getPaddleClient().transactions.get(transactionId);
  if (transaction.status !== "paid" && transaction.status !== "completed") {
    throw new Error("Transaction is not completed");
  }

  const customSessionId = getStringCustomDataValue(
    transaction.customData as Record<string, unknown> | null | undefined,
    "checkoutSessionId",
  );
  if (customSessionId !== sessionId) {
    throw new Error("Transaction does not match checkout session");
  }

  if (
    checkoutSession.paddleCustomerId &&
    transaction.customerId &&
    checkoutSession.paddleCustomerId !== transaction.customerId
  ) {
    throw new Error("Transaction customer does not match checkout session");
  }

  const matchedPrice = transaction.items.some(
    (item) => item.price?.id === checkoutSession.priceId,
  );
  if (!matchedPrice) {
    throw new Error("Transaction does not match checkout price");
  }

  if (!transaction.subscriptionId) {
    throw new Error("Transaction does not include a subscription");
  }

  const subscription = await getPaddleClient().subscriptions.get(transaction.subscriptionId);
  if (subscription.customerId !== transaction.customerId) {
    throw new Error("Subscription customer does not match transaction customer");
  }
  const subscriptionPriceIds = Array.from(
    new Set(
      subscription.items
        .map((item) => item.price?.id)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );
  const primaryItem =
    subscription.items.find((item) => item.price?.id === checkoutSession.priceId) ??
    subscription.items[0];
  const startedWithTrial =
    subscription.status === "trialing" ||
    subscription.items.some(
      (item) => item.status === "trialing" || item.trialDates !== null,
    );

  await convex.mutation(api.billing.markCheckoutCompletedFromVerification, {
    sessionId,
    transactionId,
    paddleCustomerId: transaction.customerId ?? undefined,
    paddleSubscriptionId: transaction.subscriptionId,
    subscriptionStatus: subscription.status,
    subscriptionUpdatedAt: subscription.updatedAt,
    priceId:
      typeof primaryItem?.price?.id === "string" ? primaryItem.price.id : undefined,
    priceIds: subscriptionPriceIds,
    productId:
      typeof primaryItem?.product?.id === "string" ? primaryItem.product.id : undefined,
    currentPeriodStartsAt:
      subscription.currentBillingPeriod?.startsAt ?? subscription.startedAt ?? null,
    currentPeriodEndsAt: subscription.currentBillingPeriod?.endsAt ?? null,
    nextBilledAt: subscription.nextBilledAt ?? null,
    canceledAt: subscription.canceledAt ?? null,
    startedWithTrial,
    canceledDuringTrial: subscription.status === "canceled" && startedWithTrial,
  });

  return {
    customerId: transaction.customerId ?? null,
    subscriptionId: transaction.subscriptionId ?? null,
    transactionId: transaction.id,
  };
}
