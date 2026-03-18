import type { UserIdentity } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutationGeneric, type GenericDatabaseReader } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { resolveBillingTierByPriceId } from "./billingPlans";
import { findCanonicalUserByExternalId } from "./billingIdentity";
import { isSubscriptionEntitled, pickEffectiveSubscription } from "./subscriptionAccess";

type AuthCtx = {
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>;
  };
};

type BillingTier = "free" | "pro" | "pro_plus";
type UsageReadDb = GenericDatabaseReader<DataModel>;

const PREMIUM_TTS_FEATURE = "premium_tts";

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

function isStoredBillingTier(value: string | undefined): value is Exclude<BillingTier, "free"> {
  return value === "pro" || value === "pro_plus";
}

async function resolveSubscriptionTier(
  db: UsageReadDb,
  subscription: { tier?: string; priceId?: string } | null | undefined,
): Promise<BillingTier> {
  if (!subscription) return "free";
  if (isStoredBillingTier(subscription.tier)) {
    return subscription.tier;
  }
  return (await resolveBillingTierByPriceId(db, subscription.priceId)) ?? "free";
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

    const user = await findCanonicalUserByExternalId(ctx.db, identity.subject);
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
    const trialActive = status === "trialing" && isActive;
    if (!isActive) {
      return {
        allowed: false,
        reason: "inactive_plan",
      } as const;
    }

    const tier = (await resolveSubscriptionTier(ctx.db, subscription)) as BillingTier;
    const trialEndsAt =
      trialActive && subscription
        ? (subscription.currentPeriodEndsAt ?? subscription.nextBilledAt ?? null)
        : null;

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
        trialEndsAt: trialActive ? trialEndsAt ?? undefined : undefined,
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
