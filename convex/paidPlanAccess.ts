import type { GenericDatabaseReader } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { resolveBillingTierByPlan, resolveBillingTierByPriceId } from "./billingPlans";
import { resolveBillingAccess, type BillingAccessSource } from "./subscriptionAccess";

type BillingReadDb = GenericDatabaseReader<DataModel>;
type StoredBillingTier = "pro" | "pro_plus";

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
        manualAccessTier?: string;
        manualAccessEndsAt?: number | null;
      }
    | null
    | undefined,
  now = Date.now(),
): Promise<ResolvedPaidPlanAccess> {
  const manualAccessTier = resolveManualAccessTier(user, now);
  if (manualAccessTier) {
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

  const access = resolveBillingAccess(subscription, now);

  const tier = await resolveRecognizedSubscriptionTier(db, subscription);
  const subscriptionEntitled = access.subscriptionEntitled && tier !== "inactive";

  const trialActive = subscriptionEntitled ? access.trialActive : false;
  const activeAccessSource = subscriptionEntitled ? access.accessSource : "none";
  const hasPremiumVoice =
    subscriptionEntitled && (trialActive || tier === "pro_plus");

  return {
    isActive: subscriptionEntitled,
    trialActive,
    trialEndsAt: subscriptionEntitled ? access.trialEndsAt : null,
    accessSource: activeAccessSource,
    subscriptionEntitled,
    // Inactive users are redirected to /start-trial; there is no signed-in free tier.
    tier: subscriptionEntitled ? tier : "inactive",
    hasPremiumVoice,
    premiumVoiceSource: trialActive
      ? "trial"
      : subscriptionEntitled
        ? tier === "pro_plus"
          ? "pro_plus"
          : "pro_preview"
        : "none",
  };
}
