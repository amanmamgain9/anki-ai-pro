/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConvexError } from "convex/values";
import { findCanonicalUserByExternalId } from "./billingIdentity";
import { isSubscriptionEntitled } from "./subscriptionAccess";

function hasAnyEntitledSubscription(
  rows: Array<{ status?: string | null; currentPeriodEndsAt?: number | null }>,
) {
  const now = Date.now();
  return rows.some((row) =>
    isSubscriptionEntitled(row.status, row.currentPeriodEndsAt, now),
  );
}

type EntitlementCtx = {
  auth: {
    getUserIdentity: () => Promise<{ subject?: string } | null>;
  };
  db: any;
};

export async function getEntitledExternalUserId(ctx: EntitlementCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const subject = identity?.subject ?? null;
  if (!subject) return null;

  const user = await findCanonicalUserByExternalId(ctx.db, subject);
  if (!user) return null;

  const subscriptions = await ctx.db
    .query("subscriptions")
    .withIndex("by_userId_updatedAt", (q: any) => q.eq("userId", user._id))
    .order("desc")
    .collect();

  if (hasAnyEntitledSubscription(subscriptions)) {
    return user.externalId;
  }

  return null;
}

export async function requireEntitledExternalUserId(ctx: EntitlementCtx) {
  const externalId = await getEntitledExternalUserId(ctx);
  if (!externalId) throw new ConvexError("Pro plan required");
  return externalId;
}
