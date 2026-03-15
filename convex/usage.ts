import type { UserIdentity } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutationGeneric } from "convex/server";
import { resolveBillingTierByPriceId } from "./billingPlans";
import { isSubscriptionEntitled, pickEffectiveSubscription } from "./subscriptionAccess";

type AuthCtx = {
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>;
  };
};

type BillingTier = "free" | "pro" | "pro_plus";

const PREMIUM_TTS_FEATURE = "premium_tts";
const DAY_MS = 86_400_000;

function getCurrentMonthKey(now: number) {
  const d = new Date(now);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function resolveProPreviewQuotaChars() {
  const raw = process.env.PRO_PREMIUM_TTS_PREVIEW_CHARS ?? "60000";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 60000;
  return Math.max(0, Math.floor(parsed));
}

function resolveFreeProPlusTrialDays() {
  const raw = process.env.FREE_PRO_PLUS_TRIAL_DAYS ?? "3";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(0, Math.floor(parsed));
}

async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Unauthorized");
  }
  return identity;
}

export const consumePremiumTtsPreview = mutationGeneric({
  args: {
    units: v.number(),
  },
  handler: async (ctx, { units }) => {
    const normalizedUnits = Math.max(1, Math.floor(units));
    const now = Date.now();
    const identity = await requireIdentity(ctx);

    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();
    if (!user) {
      throw new ConvexError("User not found. Run syncCurrentUser first.");
    }

    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_userId_updatedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    const subscription = pickEffectiveSubscription(subscriptions, now);
    const status = subscription?.status ?? null;
    const isActive = isSubscriptionEntitled(
      status,
      subscription?.currentPeriodEndsAt,
      now,
    );
    const trialDays = resolveFreeProPlusTrialDays();
    const trialEndsAt = user.createdAt + trialDays * DAY_MS;
    const trialActive = trialDays > 0 && !isActive && now < trialEndsAt;
    if (!isActive && !trialActive) {
      return {
        allowed: false,
        reason: "inactive_plan",
      } as const;
    }

    const tier: BillingTier = trialActive
      ? "pro_plus"
      : isActive
        ? await resolveBillingTierByPriceId(ctx.db, subscription?.priceId)
        : "free";

    const monthKey = getCurrentMonthKey(now);
    const rowsForUser = await ctx.db
      .query("featureUsageMonthly")
      .withIndex("by_user_month", (q) => q.eq("userId", user._id))
      .collect();
    const existing =
      rowsForUser.find(
        (row) => row.feature === PREMIUM_TTS_FEATURE && row.monthKey === monthKey,
      ) ?? null;

    if (tier === "pro_plus") {
      if (existing) {
        await ctx.db.patch(existing._id, {
          usedUnits: existing.usedUnits + normalizedUnits,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("featureUsageMonthly", {
          userId: user._id,
          feature: PREMIUM_TTS_FEATURE,
          monthKey,
          usedUnits: normalizedUnits,
          createdAt: now,
          updatedAt: now,
        });
      }
      return {
        allowed: true,
        tier,
        unlimited: true,
        source: trialActive ? "trial" : "subscription",
        trialEndsAt: trialActive ? trialEndsAt : undefined,
      } as const;
    }

    const quota = resolveProPreviewQuotaChars();
    const used = existing?.usedUnits ?? 0;
    const nextUsed = used + normalizedUnits;
    if (nextUsed > quota) {
      return {
        allowed: false,
        tier,
        unlimited: false,
        quota,
        used,
        remaining: Math.max(0, quota - used),
        reason: "preview_exhausted",
      } as const;
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        usedUnits: nextUsed,
        quotaUnits: quota,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("featureUsageMonthly", {
        userId: user._id,
        feature: PREMIUM_TTS_FEATURE,
        monthKey,
        usedUnits: nextUsed,
        quotaUnits: quota,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      allowed: true,
      tier,
      unlimited: false,
      quota,
      used: nextUsed,
      remaining: Math.max(0, quota - nextUsed),
    } as const;
  },
});
