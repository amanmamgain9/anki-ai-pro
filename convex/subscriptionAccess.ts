function normalizeStatus(status: string | null | undefined) {
  if (typeof status !== "string") return null;
  const normalized = status.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export type BillingAccessSource =
  | "none"
  | "manual"
  | "subscription"
  | "subscription_trial";

function getStoredPeriodEndsAt(
  currentPeriodEndsAt: number | null | undefined,
  nextBilledAt: number | null | undefined,
) {
  return currentPeriodEndsAt ?? nextBilledAt ?? null;
}

function resolveFreeProPlusTrialDays() {
  const raw = process.env.FREE_PRO_PLUS_TRIAL_DAYS ?? "3";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(0, Math.floor(parsed));
}

function isLegacyCanceledTrialFallback(
  currentPeriodStartsAt: number | null | undefined,
  currentPeriodEndsAt: number | null | undefined,
  nextBilledAt: number | null | undefined,
  now: number,
) {
  const trialDays = resolveFreeProPlusTrialDays();
  if (trialDays <= 0) return false;
  const startsAt =
    typeof currentPeriodStartsAt === "number" ? currentPeriodStartsAt : null;
  const endsAt = getStoredPeriodEndsAt(currentPeriodEndsAt, nextBilledAt);
  if (startsAt === null || typeof endsAt !== "number" || now >= endsAt) return false;
  return endsAt - startsAt <= trialDays * 86_400_000;
}

function getEntitledStatusRank(status: string | null | undefined) {
  switch (normalizeStatus(status)) {
    case "active":
      return 3;
    case "trialing":
      return 2;
    case "canceled":
      return 1;
    default:
      return 0;
  }
}

function getRecoverableStatusRank(status: string | null | undefined) {
  switch (normalizeStatus(status)) {
    case "past_due":
      return 3;
    case "paused":
      return 2;
    case "active":
    case "trialing":
    case "canceled":
      return 0;
    default:
      return -1;
  }
}

function getVersionTime(
  row: {
    lastSubscriptionUpdatedAt?: number | null;
    lastEventOccurredAt?: number | null;
    updatedAt?: number | null;
    createdAt?: number | null;
  },
) {
  return (
    row.lastSubscriptionUpdatedAt ??
    row.lastEventOccurredAt ??
    row.updatedAt ??
    row.createdAt ??
    0
  );
}

export function isSubscriptionEntitled(
  status: string | null | undefined,
  currentPeriodEndsAt: number | null | undefined,
  nextBilledAt: number | null | undefined,
  now = Date.now(),
) {
  const normalized = normalizeStatus(status);
  const storedPeriodEndsAt = getStoredPeriodEndsAt(currentPeriodEndsAt, nextBilledAt);
  if (normalized === "trialing" || normalized === "active") {
    return typeof storedPeriodEndsAt === "number" && now < storedPeriodEndsAt;
  }
  if (normalized === "canceled") {
    return typeof storedPeriodEndsAt === "number" && now < storedPeriodEndsAt;
  }
  return false;
}

export function subscriptionRequiresBillingManagement(
  status: string | null | undefined,
  currentPeriodEndsAt: number | null | undefined,
  nextBilledAt: number | null | undefined,
  requiresPriceMappingReview = false,
  _now = Date.now(),
) {
  void currentPeriodEndsAt;
  void nextBilledAt;
  void _now;
  if (requiresPriceMappingReview) return true;
  const normalized = normalizeStatus(status);
  if (!normalized) return false;
  if (normalized === "expired") return false;
  if (
    normalized === "active" ||
    normalized === "trialing" ||
    normalized === "canceled" ||
    normalized === "created"
  ) {
    return false;
  }
  if (normalized === "past_due" || normalized === "paused") {
    return true;
  }
  return false;
}

export function subscriptionCanSelfServeManage<
  T extends {
    status?: string | null;
    currentPeriodEndsAt?: number | null;
    nextBilledAt?: number | null;
    requiresPriceMappingReview?: boolean | null;
    paddleCustomerId?: string | null;
    paddleSubscriptionId?: string | null;
  },
>(row: T | null | undefined, now = Date.now()) {
  if (!row) return false;
  if (
    !subscriptionRequiresBillingManagement(
      row.status,
      row.currentPeriodEndsAt,
      row.nextBilledAt,
      row.requiresPriceMappingReview === true,
      now,
    )
  ) {
    return false;
  }
  if (
    typeof row.paddleCustomerId !== "string" ||
    row.paddleCustomerId.length === 0 ||
    typeof row.paddleSubscriptionId !== "string" ||
    row.paddleSubscriptionId.length === 0
  ) {
    return false;
  }
  if (row.requiresPriceMappingReview === true) {
    return false;
  }
  return true;
}

export function subscriptionNeedsMerchantReview<
  T extends {
    status?: string | null;
    currentPeriodEndsAt?: number | null;
    nextBilledAt?: number | null;
    requiresPriceMappingReview?: boolean | null;
    paddleCustomerId?: string | null;
    paddleSubscriptionId?: string | null;
  },
>(row: T | null | undefined, now = Date.now()) {
  if (!row) return false;
  return (
    subscriptionRequiresBillingManagement(
      row.status,
      row.currentPeriodEndsAt,
      row.nextBilledAt,
      row.requiresPriceMappingReview === true,
      now,
    ) && !subscriptionCanSelfServeManage(row, now)
  );
}

export function pickEffectiveSubscription<
  T extends {
    status?: string | null;
    currentPeriodEndsAt?: number | null;
    nextBilledAt?: number | null;
    requiresPriceMappingReview?: boolean | null;
    lastSubscriptionUpdatedAt?: number | null;
    lastEventOccurredAt?: number | null;
    updatedAt?: number | null;
    createdAt?: number | null;
  },
>(rows: T[], now = Date.now()): T | null {
  return (
    [...rows].sort((a, b) => {
      const aEntitled = isSubscriptionEntitled(
        a.status,
        a.currentPeriodEndsAt,
        a.nextBilledAt,
        now,
      );
      const bEntitled = isSubscriptionEntitled(
        b.status,
        b.currentPeriodEndsAt,
        b.nextBilledAt,
        now,
      );
      if (aEntitled !== bEntitled) return aEntitled ? -1 : 1;
      if (aEntitled && bEntitled) {
        const aEndsAt = getStoredPeriodEndsAt(a.currentPeriodEndsAt, a.nextBilledAt) ?? 0;
        const bEndsAt = getStoredPeriodEndsAt(b.currentPeriodEndsAt, b.nextBilledAt) ?? 0;
        if (aEndsAt !== bEndsAt) return bEndsAt - aEndsAt;

        const aVersion = getVersionTime(a);
        const bVersion = getVersionTime(b);
        if (aVersion !== bVersion) return bVersion - aVersion;

        const aRank = getEntitledStatusRank(a.status);
        const bRank = getEntitledStatusRank(b.status);
        if (aRank !== bRank) return bRank - aRank;
      }

      const aRecoverable = subscriptionRequiresBillingManagement(
        a.status,
        a.currentPeriodEndsAt,
        a.nextBilledAt,
        a.requiresPriceMappingReview === true,
        now,
      );
      const bRecoverable = subscriptionRequiresBillingManagement(
        b.status,
        b.currentPeriodEndsAt,
        b.nextBilledAt,
        b.requiresPriceMappingReview === true,
        now,
      );
      if (aRecoverable !== bRecoverable) return aRecoverable ? -1 : 1;
      if (aRecoverable && bRecoverable) {
        const aRank = getRecoverableStatusRank(a.status);
        const bRank = getRecoverableStatusRank(b.status);
        if (aRank !== bRank) return bRank - aRank;
      }

      const aEndsAt = getStoredPeriodEndsAt(a.currentPeriodEndsAt, a.nextBilledAt) ?? 0;
      const bEndsAt = getStoredPeriodEndsAt(b.currentPeriodEndsAt, b.nextBilledAt) ?? 0;
      if (aEndsAt !== bEndsAt) return bEndsAt - aEndsAt;

      const aVersion = getVersionTime(a);
      const bVersion = getVersionTime(b);
      if (aVersion !== bVersion) return bVersion - aVersion;

      const aUpdatedAt = a.updatedAt ?? 0;
      const bUpdatedAt = b.updatedAt ?? 0;
      if (aUpdatedAt !== bUpdatedAt) return bUpdatedAt - aUpdatedAt;

      const aCreatedAt = a.createdAt ?? 0;
      const bCreatedAt = b.createdAt ?? 0;
      return bCreatedAt - aCreatedAt;
    })[0] ?? null
  );
}

export function resolveBillingAccess<
  T extends {
    status?: string | null;
    currentPeriodStartsAt?: number | null;
    currentPeriodEndsAt?: number | null;
    nextBilledAt?: number | null;
    startedWithTrial?: boolean | null;
    canceledDuringTrial?: boolean | null;
  },
>(
  subscription: T | null | undefined,
  now = Date.now(),
) {
  const status = subscription?.status ?? null;
  const subscriptionEntitled = isSubscriptionEntitled(
    status,
    subscription?.currentPeriodEndsAt,
    subscription?.nextBilledAt,
    now,
  );
  const canceledTrialStillActive =
    normalizeStatus(status) === "canceled" &&
    subscriptionEntitled &&
    (subscription?.canceledDuringTrial === true ||
      (subscription?.canceledDuringTrial !== false &&
        subscription?.startedWithTrial === true &&
        isLegacyCanceledTrialFallback(
          subscription?.currentPeriodStartsAt,
          subscription?.currentPeriodEndsAt,
          subscription?.nextBilledAt,
          now,
        )));
  const subscriptionTrialActive =
    subscriptionEntitled &&
    (normalizeStatus(status) === "trialing" || canceledTrialStillActive);
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
  return {
    isActive: false,
    trialActive: false,
    trialEndsAt: null as number | null,
    accessSource: "none" as const,
    subscriptionEntitled: false,
  };
}
