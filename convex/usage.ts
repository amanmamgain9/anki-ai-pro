import type { UserIdentity } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutationGeneric, type GenericDatabaseReader } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { resolveBillingTierByPriceId } from "./billingPlans";
import { findCanonicalUserByExternalId } from "./billingIdentity";
import { pickEffectiveSubscription, resolveBillingAccess } from "./subscriptionAccess";

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
    const access = resolveBillingAccess(subscription, user.trialEndsAt, now);
    if (!access.isActive) {
      return {
        allowed: false,
        reason: "inactive_plan",
      } as const;
    }

    const tier = (access.accessSource === "legacy_trial"
      ? "pro_plus"
      : await resolveSubscriptionTier(ctx.db, subscription)) as BillingTier;
    const trialEndsAt = access.trialEndsAt;

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
        monthKey,
        source: access.trialActive ? "trial" : "subscription",
        trialEndsAt: access.trialActive ? trialEndsAt ?? undefined : undefined,
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
      monthKey,
      quota,
      used: nextUsed,
      remaining: Math.max(0, quota - nextUsed),
    } as const;
  },
});

export const refundPremiumTtsPreview = mutationGeneric({
  args: {
    units: v.number(),
    monthKey: v.string(),
  },
  handler: async (ctx, { units, monthKey }) => {
    const normalizedUnits = Math.max(1, Math.floor(units));
    const now = Date.now();
    const identity = await requireIdentity(ctx);

    const user = await findCanonicalUserByExternalId(ctx.db, identity.subject);
    if (!user) {
      throw new ConvexError("User not found. Run syncCurrentUser first.");
    }

    const rowsForUser = await ctx.db
      .query("featureUsageMonthly")
      .withIndex("by_user_month", (q) => q.eq("userId", user._id))
      .collect();
    const existing =
      rowsForUser.find(
        (row) => row.feature === PREMIUM_TTS_FEATURE && row.monthKey === monthKey,
      ) ?? null;

    if (!existing) {
      return {
        refunded: false,
        monthKey,
        used: 0,
      } as const;
    }

    const nextUsed = Math.max(0, existing.usedUnits - normalizedUnits);
    await ctx.db.patch(existing._id, {
      usedUnits: nextUsed,
      updatedAt: now,
    });

    return {
      refunded: true,
      monthKey,
      used: nextUsed,
    } as const;
  },
});
