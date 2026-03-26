function normalizeStatus(status: string | null | undefined) {
  if (typeof status !== "string") return null;
  const normalized = status.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export type BillingAccessSource =
  | "none"
  | "legacy_trial"
  | "subscription"
  | "subscription_trial";

export function isSubscriptionEntitled(
  status: string | null | undefined,
  currentPeriodEndsAt: number | null | undefined,
  now = Date.now(),
) {
  const normalized = normalizeStatus(status);
  if (normalized === "active" || normalized === "trialing") return true;
  if (normalized === "canceled" && typeof currentPeriodEndsAt === "number") {
    return now < currentPeriodEndsAt;
  }
  return false;
}

export function isLegacyTrialEntitled(
  trialEndsAt: number | null | undefined,
  now = Date.now(),
) {
  return typeof trialEndsAt === "number" && now < trialEndsAt;
}

export function subscriptionRequiresBillingManagement(
  status: string | null | undefined,
  currentPeriodEndsAt: number | null | undefined,
  now = Date.now(),
) {
  const normalized = normalizeStatus(status);
  if (!normalized) return false;
  if (normalized === "expired") return false;
  if (normalized === "canceled") {
    return typeof currentPeriodEndsAt === "number" ? now < currentPeriodEndsAt : false;
  }
  if (normalized === "active" || normalized === "trialing") return true;
  if (normalized === "past_due" || normalized === "paused" || normalized === "created") {
    return true;
  }
  return false;
}

export function pickEffectiveSubscription<
  T extends { status?: string | null; currentPeriodEndsAt?: number | null },
>(rows: T[], now = Date.now()): T | null {
  for (const row of rows) {
    const normalized = normalizeStatus(row.status);
    if (normalized === "active" || normalized === "trialing") return row;
  }
  for (const row of rows) {
    if (isSubscriptionEntitled(row.status, row.currentPeriodEndsAt, now)) return row;
  }
  for (const row of rows) {
    if (subscriptionRequiresBillingManagement(row.status, row.currentPeriodEndsAt, now)) {
      return row;
    }
  }
  return rows[0] ?? null;
}

export function resolveBillingAccess<
  T extends {
    status?: string | null;
    currentPeriodEndsAt?: number | null;
    nextBilledAt?: number | null;
  },
>(
  subscription: T | null | undefined,
  userTrialEndsAt: number | null | undefined,
  now = Date.now(),
) {
  const status = subscription?.status ?? null;
  const subscriptionEntitled = isSubscriptionEntitled(
    status,
    subscription?.currentPeriodEndsAt,
    now,
  );
  const subscriptionTrialActive =
    normalizeStatus(status) === "trialing" && subscriptionEntitled;
  const subscriptionTrialEndsAt =
    subscriptionTrialActive && subscription
      ? (subscription.currentPeriodEndsAt ?? subscription.nextBilledAt ?? null)
      : null;

  if (subscriptionEntitled) {
    return {
      isActive: true,
      trialActive: subscriptionTrialActive,
      trialEndsAt: subscriptionTrialEndsAt,
      accessSource: subscriptionTrialActive
        ? ("subscription_trial" as const)
        : ("subscription" as const),
      subscriptionEntitled: true,
    };
  }

  if (isLegacyTrialEntitled(userTrialEndsAt, now)) {
    return {
      isActive: true,
      trialActive: true,
      trialEndsAt: userTrialEndsAt ?? null,
      accessSource: "legacy_trial" as const,
      subscriptionEntitled: false,
    };
  }

  return {
    isActive: false,
    trialActive: false,
    trialEndsAt: null as number | null,
    accessSource: "none" as const,
    subscriptionEntitled: false,
  };
}
