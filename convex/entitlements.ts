/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConvexError } from "convex/values";
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
  const externalId = identity?.subject ?? null;
  if (!externalId) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_externalId", (q: any) => q.eq("externalId", externalId))
    .first();
  if (!user) return null;

  const subscriptions = await ctx.db
    .query("subscriptions")
    .withIndex("by_userId_updatedAt", (q: any) => q.eq("userId", user._id))
    .order("desc")
    .collect();

  if (hasAnyEntitledSubscription(subscriptions)) {
    return externalId;
  }

  return null;
}

export async function requireEntitledExternalUserId(ctx: EntitlementCtx) {
  const externalId = await getEntitledExternalUserId(ctx);
  if (!externalId) throw new ConvexError("Pro plan required");
  return externalId;
}
