export function isSubscriptionEntitled(
  status: string | null | undefined,
  currentPeriodEndsAt: number | null | undefined,
  now = Date.now(),
) {
  if (status === "active" || status === "trialing") return true;
  if (status === "canceled" && typeof currentPeriodEndsAt === "number") {
    return now < currentPeriodEndsAt;
  }
  return false;
}

export function subscriptionRequiresBillingManagement(
  status: string | null | undefined,
  currentPeriodEndsAt: number | null | undefined,
  now = Date.now(),
) {
  if (!status) return false;
  if (status === "expired") return false;
  if (status === "canceled") {
    return typeof currentPeriodEndsAt === "number" ? now < currentPeriodEndsAt : false;
  }
  if (status === "active" || status === "trialing") return true;
  if (status === "past_due" || status === "paused" || status === "created") return true;
  return true;
}

export function pickEffectiveSubscription<
  T extends { status?: string | null; currentPeriodEndsAt?: number | null },
>(rows: T[], now = Date.now()): T | null {
  for (const row of rows) {
    if (row.status === "active" || row.status === "trialing") return row;
  }
  for (const row of rows) {
    if (isSubscriptionEntitled(row.status, row.currentPeriodEndsAt, now)) return row;
  }
  return rows[0] ?? null;
}
