import type { UserIdentity } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutationGeneric } from "convex/server";

type AuthCtx = {
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>;
  };
};

type BillingTier = "free" | "pro" | "pro_plus";

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

function getTierFromPriceId(priceId: string | undefined): BillingTier {
  if (!priceId) return "pro";

  const proPlusPriceIds = new Set(
    [
      process.env.PADDLE_PRICE_ID_PRO_PLUS_MONTHLY,
      process.env.PADDLE_PRICE_ID_PRO_PLUS_YEARLY,
    ].filter((value): value is string => Boolean(value)),
  );
  if (proPlusPriceIds.has(priceId)) return "pro_plus";

  const proPriceIds = new Set(
    [
      process.env.PADDLE_PRICE_ID_PRO_MONTHLY,
      process.env.PADDLE_PRICE_ID_PRO_YEARLY,
      process.env.PADDLE_PRICE_ID_MONTHLY,
      process.env.PADDLE_PRICE_ID_YEARLY,
    ].filter((value): value is string => Boolean(value)),
  );
  if (proPriceIds.size === 0) return "pro";
  if (proPriceIds.has(priceId)) return "pro";
  return "pro";
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
    const identity = await requireIdentity(ctx);

    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();
    if (!user) {
      throw new ConvexError("User not found. Run syncCurrentUser first.");
    }

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_userId_updatedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
    const status = subscription?.status ?? null;
    const isActive = status === "active" || status === "trialing";
    if (!isActive) {
      return {
        allowed: false,
        reason: "inactive_plan",
      } as const;
    }

    const tier = getTierFromPriceId(subscription?.priceId);
    if (tier === "free") {
      return {
        allowed: false,
        reason: "inactive_plan",
      } as const;
    }

    const now = Date.now();
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
