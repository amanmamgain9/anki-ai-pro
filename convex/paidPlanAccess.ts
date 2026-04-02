import type { GenericDatabaseReader } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import {
  type BillingPlan,
  isTrialEligibleBillingPriceId,
  resolveBillingTierByPlan,
  resolveBillingTierByPriceId,
} from "./billingPlans";
import { resolveBillingAccess, type BillingAccessSource } from "./subscriptionAccess";

type BillingReadDb = GenericDatabaseReader<DataModel>;
type StoredBillingTier = "pro" | "pro_plus";
const VERIFIED_CHECKOUT_ACCESS_TTL_MS = 24 * 60 * 60 * 1000;

export type ResolvedPaidPlanAccess = {
  isActive: boolean;
  trialActive: boolean;
  trialEndsAt: number | null;
  accessSource: BillingAccessSource;
  subscriptionEntitled: boolean;
  // "inactive" is a locked-out state, not a signed-in free/basic tier.
  tier: StoredBillingTier | "inactive";
  hasPremiumVoice: boolean;
  premiumVoiceSource: "none" | "trial" | "pro_preview" | "pro_plus";
};

function isStoredBillingTier(value: string | undefined): value is StoredBillingTier {
  return value === "pro" || value === "pro_plus";
}

function resolveManualAccessTier(
  user:
    | {
        _id?: DataModel["users"]["document"]["_id"];
        manualAccessTier?: string;
        manualAccessEndsAt?: number | null;
      }
    | null
    | undefined,
  now: number,
): StoredBillingTier | null {
  if (!user || !isStoredBillingTier(user.manualAccessTier)) {
    return null;
  }
  if (
    typeof user.manualAccessEndsAt === "number" &&
    Number.isFinite(user.manualAccessEndsAt) &&
    now >= user.manualAccessEndsAt
  ) {
    return null;
  }
  return user.manualAccessTier;
}

function getTierRank(tier: StoredBillingTier | "inactive") {
  switch (tier) {
    case "pro_plus":
      return 2;
    case "pro":
      return 1;
    default:
      return 0;
  }
}

function resolveFreeProPlusTrialDays() {
  const raw = process.env.FREE_PRO_PLUS_TRIAL_DAYS ?? "3";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(0, Math.floor(parsed));
}

async function resolveVerifiedCheckoutAccess(
  db: BillingReadDb,
  userId: DataModel["users"]["document"]["_id"] | undefined,
  now: number,
) {
  if (!userId) return null;
  const sessions = await db
    .query("paddleCheckoutSessions")
    .withIndex("by_userId_createdAt", (q) => q.eq("userId", userId))
    .order("desc")
    .collect();

  for (const row of sessions) {
    if (
      typeof row.verifiedCompletedAt !== "number" ||
      !Number.isFinite(row.verifiedCompletedAt) ||
      now - row.verifiedCompletedAt > VERIFIED_CHECKOUT_ACCESS_TTL_MS ||
      typeof row.completedAt === "number"
    ) {
      continue;
    }
    const plan = row.plan as BillingPlan;
    const tier = resolveBillingTierByPlan(plan);
    if (!tier) continue;
    const trialActive =
      resolveFreeProPlusTrialDays() > 0 &&
      (await isTrialEligibleBillingPriceId(db, plan, row.priceId));
    return {
      isActive: true,
      trialActive,
      trialEndsAt: trialActive
        ? row.verifiedCompletedAt + resolveFreeProPlusTrialDays() * 86_400_000
        : null,
      accessSource: trialActive
        ? ("subscription_trial" as const)
        : ("subscription" as const),
      subscriptionEntitled: true,
      tier,
      hasPremiumVoice: trialActive || tier === "pro_plus",
      premiumVoiceSource: trialActive
        ? ("trial" as const)
        : tier === "pro_plus"
          ? ("pro_plus" as const)
          : ("pro_preview" as const),
    };
  }
  return null;
}

export async function resolveRecognizedSubscriptionTier(
  db: BillingReadDb,
  subscription:
    | {
        appPlan?: string;
        tier?: string;
        tierSourcePriceId?: string;
        priceId?: string;
        requiresPriceMappingReview?: boolean;
      }
    | null
    | undefined,
): Promise<StoredBillingTier | "inactive"> {
  // No recognized paid tier means no app access. This is not a free/basic plan.
  if (!subscription) return "inactive";
  const currentMappedTier =
    (await resolveBillingTierByPriceId(db, subscription.priceId)) ?? null;
  if (currentMappedTier) {
    return currentMappedTier;
  }
  if (isStoredBillingTier(subscription.tier)) {
    // Historical sold prices must stay mapped even after deactivation.
    // If Paddle starts sending a new price before mappings are updated,
    // keep the last recognized app tier rather than dropping paid access.
    return subscription.tier;
  }
  const planTier = resolveBillingTierByPlan(subscription.appPlan);
  if (planTier) {
    return planTier;
  }
  return "inactive";
}

export async function isRecognizedSubscription(
  db: BillingReadDb,
  subscription:
    | {
        tier?: string;
        tierSourcePriceId?: string;
        priceId?: string;
        requiresPriceMappingReview?: boolean;
      }
    | null
    | undefined,
) {
  return (await resolveRecognizedSubscriptionTier(db, subscription)) !== "inactive";
}

export async function resolvePaidPlanAccess(
  db: BillingReadDb,
  subscription:
    | {
        status?: string | null;
        currentPeriodStartsAt?: number | null;
        currentPeriodEndsAt?: number | null;
        nextBilledAt?: number | null;
        startedWithTrial?: boolean | null;
        canceledDuringTrial?: boolean | null;
        appPlan?: string;
        tier?: string;
        tierSourcePriceId?: string;
        priceId?: string;
        requiresPriceMappingReview?: boolean;
      }
    | null
    | undefined,
  user:
    | {
        _id?: DataModel["users"]["document"]["_id"];
        manualAccessTier?: string;
        manualAccessEndsAt?: number | null;
      }
    | null
    | undefined,
  now = Date.now(),
): Promise<ResolvedPaidPlanAccess> {
  const manualAccessTier = resolveManualAccessTier(user, now);
  const access = resolveBillingAccess(subscription, now);
  const tier = await resolveRecognizedSubscriptionTier(db, subscription);
  const subscriptionEntitled = access.subscriptionEntitled && tier !== "inactive";
  if (subscriptionEntitled) {
    const effectiveTier =
      manualAccessTier && getTierRank(manualAccessTier) > getTierRank(tier)
        ? manualAccessTier
        : tier;
    const trialActive = access.trialActive;
    const hasPremiumVoice = trialActive || effectiveTier === "pro_plus";

    return {
      isActive: true,
      trialActive,
      trialEndsAt: access.trialEndsAt,
      accessSource: access.accessSource,
      subscriptionEntitled: true,
      tier: effectiveTier,
      hasPremiumVoice,
      premiumVoiceSource: trialActive
        ? "trial"
        : effectiveTier === "pro_plus"
          ? "pro_plus"
          : "pro_preview",
    };
  }

  if (manualAccessTier) {
    const verifiedCheckoutAccess = await resolveVerifiedCheckoutAccess(
      db,
      user?._id,
      now,
    );
    if (verifiedCheckoutAccess) {
      const effectiveTier =
        getTierRank(manualAccessTier) > getTierRank(verifiedCheckoutAccess.tier)
          ? manualAccessTier
          : verifiedCheckoutAccess.tier;
      return {
        ...verifiedCheckoutAccess,
        tier: effectiveTier,
        hasPremiumVoice:
          verifiedCheckoutAccess.trialActive || effectiveTier === "pro_plus",
        premiumVoiceSource: verifiedCheckoutAccess.trialActive
          ? "trial"
          : effectiveTier === "pro_plus"
            ? "pro_plus"
            : "pro_preview",
      };
    }
    return {
      isActive: true,
      trialActive: false,
      trialEndsAt: null,
      accessSource: "manual",
      subscriptionEntitled: false,
      tier: manualAccessTier,
      hasPremiumVoice: manualAccessTier === "pro_plus",
      premiumVoiceSource: manualAccessTier === "pro_plus" ? "pro_plus" : "pro_preview",
    };
  }

  const verifiedCheckoutAccess = await resolveVerifiedCheckoutAccess(db, user?._id, now);
  if (verifiedCheckoutAccess) {
    return verifiedCheckoutAccess;
  }

  return {
    isActive: false,
    trialActive: false,
    trialEndsAt: null,
    accessSource: "none",
    subscriptionEntitled: false,
    // Inactive users are redirected to /start-trial; there is no signed-in free tier.
    tier: "inactive",
    hasPremiumVoice: false,
    premiumVoiceSource: "none",
  };
}
