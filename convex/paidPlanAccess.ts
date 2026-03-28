import type { GenericDatabaseReader } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { resolveBillingTierByPriceId } from "./billingPlans";
import { resolveBillingAccess, type BillingAccessSource } from "./subscriptionAccess";

type BillingReadDb = GenericDatabaseReader<DataModel>;
type StoredBillingTier = "pro" | "pro_plus";

export type ResolvedPaidPlanAccess = {
  isActive: boolean;
  trialActive: boolean;
  trialEndsAt: number | null;
  accessSource: BillingAccessSource;
  subscriptionEntitled: boolean;
  tier: StoredBillingTier | "free";
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
    | { tier?: string; tierSourcePriceId?: string; priceId?: string }
    | null
    | undefined,
): Promise<StoredBillingTier | "free"> {
  if (!subscription) return "free";
  if (isStoredBillingTier(subscription.tier)) {
    return subscription.tier;
  }
  return (await resolveBillingTierByPriceId(db, subscription.priceId)) ?? "free";
}

export async function resolvePaidPlanAccess(
  db: BillingReadDb,
  subscription:
    | {
        status?: string | null;
        currentPeriodEndsAt?: number | null;
        nextBilledAt?: number | null;
        tier?: string;
        tierSourcePriceId?: string;
        priceId?: string;
      }
    | null
    | undefined,
  user:
    | {
        trialEndsAt?: number | null;
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

  const access = resolveBillingAccess(subscription, user?.trialEndsAt, now);

  const tier = await resolveRecognizedSubscriptionTier(db, subscription);
  const subscriptionEntitled = access.subscriptionEntitled && tier !== "free";
  const userTrialActive = access.accessSource === "user_trial" && access.isActive;

  if (userTrialActive) {
    return {
      isActive: true,
      trialActive: true,
      trialEndsAt: access.trialEndsAt,
      accessSource: "user_trial",
      subscriptionEntitled: false,
      tier: "pro",
      hasPremiumVoice: false,
      premiumVoiceSource: "trial",
    };
  }

  const trialActive = subscriptionEntitled ? access.trialActive : false;
  const activeAccessSource = subscriptionEntitled ? access.accessSource : "none";

  return {
    isActive: subscriptionEntitled,
    trialActive,
    trialEndsAt: subscriptionEntitled ? access.trialEndsAt : null,
    accessSource: activeAccessSource,
    subscriptionEntitled,
    tier: subscriptionEntitled ? tier : "free",
    hasPremiumVoice: subscriptionEntitled && tier === "pro_plus",
    premiumVoiceSource: trialActive
      ? "trial"
      : subscriptionEntitled
        ? tier === "pro_plus"
          ? "pro_plus"
          : "pro_preview"
        : "none",
  };
}
