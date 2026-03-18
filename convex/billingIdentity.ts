import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc } from "./_generated/dataModel";
import {
  isSubscriptionEntitled,
  subscriptionRequiresBillingManagement,
} from "./subscriptionAccess";

type BillingIdentityDb = GenericDatabaseReader<DataModel>;
type BillingUser = Doc<"users">;
type BillingSubscription = Doc<"subscriptions">;

async function scoreBillingUser(db: BillingIdentityDb, user: BillingUser) {
  const subscriptions = await db
    .query("subscriptions")
    .withIndex("by_userId_updatedAt", (q) => q.eq("userId", user._id))
    .collect();
  const now = Date.now();
  return {
    user,
    entitled: subscriptions.some((row) =>
      isSubscriptionEntitled(row.status, row.currentPeriodEndsAt, now),
    ),
    recoverable: subscriptions.some((row) =>
      subscriptionRequiresBillingManagement(row.status, row.currentPeriodEndsAt, now),
    ),
    subscriptionCount: subscriptions.length,
  };
}

async function pickCanonicalBillingUser(
  db: BillingIdentityDb,
  candidates: BillingUser[],
) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const scored = await Promise.all(candidates.map((user) => scoreBillingUser(db, user)));
  scored.sort((a, b) => {
    if (a.entitled !== b.entitled) return a.entitled ? -1 : 1;
    if (a.recoverable !== b.recoverable) return a.recoverable ? -1 : 1;
    if (a.subscriptionCount !== b.subscriptionCount) {
      return b.subscriptionCount - a.subscriptionCount;
    }
    if (Boolean(a.user.paddleCustomerId) !== Boolean(b.user.paddleCustomerId)) {
      return a.user.paddleCustomerId ? -1 : 1;
    }
    if (a.user.createdAt !== b.user.createdAt) {
      return a.user.createdAt - b.user.createdAt;
    }
    return a.user._creationTime - b.user._creationTime;
  });

  return scored[0]?.user ?? null;
}

export async function listUsersByPaddleCustomerId(
  db: BillingIdentityDb,
  customerId: string,
) {
  return await db
    .query("users")
    .withIndex("by_paddleCustomerId", (q) => q.eq("paddleCustomerId", customerId))
    .collect();
}

export async function findCanonicalUserByExternalId(
  db: BillingIdentityDb,
  externalId: string | undefined,
) {
  if (!externalId) return null;
  const candidates = (await db
    .query("users")
    .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
    .collect()) as BillingUser[];
  return await pickCanonicalBillingUser(db, candidates);
}

export async function findCanonicalUserByEmail(
  db: BillingIdentityDb,
  email: string | undefined,
) {
  if (!email) return null;
  const candidates = (await db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .collect()) as BillingUser[];
  return await pickCanonicalBillingUser(db, candidates);
}

export async function findCanonicalUserByPaddleCustomerId(
  db: BillingIdentityDb,
  customerId: string | undefined,
) {
  if (!customerId) return null;
  const candidates = await listUsersByPaddleCustomerId(db, customerId);
  return await pickCanonicalBillingUser(db, candidates);
}

export function pickCanonicalSubscriptionRow<T extends {
  lastSubscriptionUpdatedAt?: number | null;
  lastEventOccurredAt?: number | null;
  updatedAt: number;
  createdAt: number;
}>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const aVersion = a.lastSubscriptionUpdatedAt ?? a.lastEventOccurredAt ?? a.updatedAt;
    const bVersion = b.lastSubscriptionUpdatedAt ?? b.lastEventOccurredAt ?? b.updatedAt;
    if (bVersion !== aVersion) return bVersion - aVersion;
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return b.createdAt - a.createdAt;
  })[0] ?? null;
}

export async function findCanonicalSubscriptionByPaddleSubscriptionId(
  db: BillingIdentityDb,
  paddleSubscriptionId: string | undefined,
) {
  if (!paddleSubscriptionId) return null;
  const matches = (await db
    .query("subscriptions")
    .withIndex("by_paddleSubscriptionId", (q) =>
      q.eq("paddleSubscriptionId", paddleSubscriptionId),
    )
    .collect()) as BillingSubscription[];
  return pickCanonicalSubscriptionRow(matches);
}
