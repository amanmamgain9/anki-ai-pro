import { ConvexError } from "convex/values";

const DAY_MS = 86_400_000;

function resolveFreeProPlusTrialDays() {
  const raw = process.env.FREE_PRO_PLUS_TRIAL_DAYS ?? "3";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(0, Math.floor(parsed));
}

function isSubscriptionActive(status: string | null | undefined) {
  return status === "active" || status === "trialing";
}

function hasAnyActiveSubscription(rows: Array<{ status?: string | null }>) {
  return rows.some((row) => isSubscriptionActive(row.status));
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

  if (hasAnyActiveSubscription(subscriptions)) {
    return externalId;
  }

  const trialDays = resolveFreeProPlusTrialDays();
  if (trialDays <= 0) return null;
  const trialEndsAt = user.createdAt + trialDays * DAY_MS;
  if (Date.now() < trialEndsAt) return externalId;

  return null;
}

export async function requireEntitledExternalUserId(ctx: EntitlementCtx) {
  const externalId = await getEntitledExternalUserId(ctx);
  if (!externalId) throw new ConvexError("Pro plan required");
  return externalId;
}
