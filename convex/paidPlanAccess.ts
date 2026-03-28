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
    | { tier?: string; tierSourcePriceId?: string; priceId?: string }
    | null
    | undefined,
): Promise<StoredBillingTier | "inactive"> {
  if (!subscription) return "inactive";
  if (isStoredBillingTier(subscription.tier)) {
    return subscription.tier;
  }
  return (await resolveBillingTierByPriceId(db, subscription.priceId)) ?? "inactive";
}

export async function isRecognizedSubscription(
  db: BillingReadDb,
  subscription:
    | { tier?: string; tierSourcePriceId?: string; priceId?: string }
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
