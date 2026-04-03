import type { UserIdentity } from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  mutationGeneric,
  queryGeneric,
  type GenericDatabaseReader,
  type GenericDatabaseWriter,
} from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import {
  type BillingPlan,
  isTrialEligibleBillingPriceId,
  resolveBillingPlanByPriceId,
  listPublicBillingPlanConfigs,
  resolveBillingTierByPriceId,
  resolveBillingTierByPlan,
  resolveCheckoutPlanPriceId,
} from "./billingPlans";
import {
  findCanonicalSubscriptionByPaddleSubscriptionId,
  findCanonicalUserByEmail,
  findCanonicalUserByExternalId,
  findCanonicalUserByIdentity,
  findCanonicalUserByPaddleCustomerId,
  listUsersByPaddleCustomerId,
} from "./billingIdentity";
import { ensureCanonicalAuthUser } from "./authUsers";
import { isRecognizedSubscription, resolvePaidPlanAccess } from "./paidPlanAccess";
import {
  pickEffectiveSubscription,
  isSubscriptionEntitled,
  subscriptionHasRecoverableBillingLinkage,
  subscriptionNeedsMerchantReview,
  subscriptionRequiresBillingManagement,
} from "./subscriptionAccess";

type AuthCtx = {
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>;
  };
};

type StoredBillingTier = "pro" | "pro_plus";
type BillingReadDb = GenericDatabaseReader<DataModel>;
type BillingWriteDb = GenericDatabaseWriter<DataModel>;
type PaddleWebhookArgs = {
  eventId: string;
  eventType: string;
  occurredAt?: string;
  checkoutSessionId?: string;
  subscriptionId?: string;
  customerId?: string;
  externalId?: string;
  subscriptionUpdatedAt?: string;
  subscriptionStatus?: string;
  priceId?: string;
  priceIds?: string[];
  productId?: string;
  currentPeriodStartsAt?: string | null;
  currentPeriodEndsAt?: string | null;
  nextBilledAt?: string | null;
  canceledAt?: string | null;
  rawBody?: string;
};

type VerifiedSubscriptionSnapshot = {
  subscriptionId: string;
  customerId?: string;
  subscriptionUpdatedAt?: string;
  subscriptionStatus?: string;
  priceId?: string;
  priceIds?: string[];
  productId?: string;
  currentPeriodStartsAt?: string | null;
  currentPeriodEndsAt?: string | null;
  nextBilledAt?: string | null;
  canceledAt?: string | null;
  startedWithTrial?: boolean;
  canceledDuringTrial?: boolean;
};

type BillingEventProcessingStatus =
  | "processed"
  | "ignored_missing_user"
  | "ignored_stale_event"
  | "ignored_unknown_plan"
  | "ignored_conflicting_owner";

const RETRYABLE_IGNORED_EVENT_STATUSES = [
  "ignored_missing_user",
  "ignored_unknown_plan",
  "ignored_conflicting_owner",
] as const;

type RetryableIgnoredBillingEventStatus =
  (typeof RETRYABLE_IGNORED_EVENT_STATUSES)[number];

function getIdentityImageUrl(identity: UserIdentity): string | undefined {
  if (typeof identity.pictureUrl === "string" && identity.pictureUrl.length > 0) {
    return identity.pictureUrl;
  }
  const picture = identity.picture;
  if (typeof picture === "string" && picture.length > 0) {
    return picture;
  }
  return undefined;
}

function getIdentityClaim(identity: UserIdentity, key: string): string | undefined {
  const value = (identity as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Unauthorized");
  }
  return identity;
}

async function findUserForIdentity(db: BillingReadDb, identity: UserIdentity) {
  return await findCanonicalUserByIdentity(db, {
    externalId: identity.subject,
    provider: getIdentityClaim(identity, "provider"),
    providerSubject: getIdentityClaim(identity, "providerSubject"),
    email: typeof identity.email === "string" ? identity.email : undefined,
  });
}

function ensureTestingAllowed(testSecret: string) {
  const expected = process.env.E2E_TEST_SECRET;
  if (!expected || testSecret !== expected) {
    throw new ConvexError("Unauthorized test helper call");
  }
}

function toMillis(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

function sanitizeEmail(email: string | undefined) {
  if (!email) return undefined;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSubscriptionStatus(eventType: string, status?: string): string {
  if (status && status.length > 0) return status.trim().toLowerCase();
  switch (eventType) {
    case "subscription.activated":
      return "active";
    case "subscription.trialing":
      return "trialing";
    case "subscription.past_due":
      return "past_due";
    case "subscription.paused":
      return "paused";
    case "subscription.canceled":
      return "canceled";
    case "subscription.resumed":
      return "active";
    case "subscription.created":
      return "created";
    default:
      return "unknown";
  }
}

const PREMIUM_TTS_PREVIEW_FEATURE = "premium_tts";
const CHECKOUT_WEBHOOK_GRACE_MS = 2 * 60_000;
const VERIFIED_CHECKOUT_WEBHOOK_GRACE_MS = 15 * 60_000;
const SUPPORT_OPERATOR_EMAILS = new Set([
  "amanmamgain9@gmail.com",
  "support@example.com",
  "planmyworkday@gmail.com",
]);

function resolveFreeProPlusTrialDays() {
  const raw = process.env.FREE_PRO_PLUS_TRIAL_DAYS ?? "3";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(0, Math.floor(parsed));
}

function resolveProPreviewQuotaChars() {
  const raw = process.env.PRO_PREMIUM_TTS_PREVIEW_CHARS ?? "60000";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 60000;
  return Math.max(0, Math.floor(parsed));
}

function getCurrentMonthKey(now: number) {
  const d = new Date(now);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function isStoredBillingTier(value: string | undefined): value is StoredBillingTier {
  return value === "pro" || value === "pro_plus";
}

function hasRecordedTrialIneligibility(
  user:
    | {
        trialRedeemedAt?: number;
        trialIneligibleAt?: number;
      }
    | null
    | undefined,
) {
  if (!user) return false;
  return (
    typeof user.trialRedeemedAt === "number" ||
    typeof user.trialIneligibleAt === "number"
  );
}

function subscriptionConsumesTrialEligibility(
  subscription:
    | {
        status?: string | null;
        currentPeriodStartsAt?: number | null;
        currentPeriodEndsAt?: number | null;
        nextBilledAt?: number | null;
        canceledAt?: number | null;
      }
    | null
    | undefined,
) {
  if (!subscription) return false;
  const normalizedStatus =
    typeof subscription.status === "string"
      ? subscription.status.trim().toLowerCase()
      : null;
  if (!normalizedStatus || normalizedStatus === "created" || normalizedStatus === "unknown") {
    return false;
  }
  if (
    typeof subscription.currentPeriodStartsAt === "number" ||
    typeof subscription.currentPeriodEndsAt === "number" ||
    typeof subscription.nextBilledAt === "number" ||
    typeof subscription.canceledAt === "number"
  ) {
    return true;
  }
  return (
    normalizedStatus === "active" ||
    normalizedStatus === "trialing" ||
    normalizedStatus === "canceled" ||
    normalizedStatus === "past_due" ||
    normalizedStatus === "paused" ||
    normalizedStatus === "expired"
  );
}

function isShortTrialWindow(
  currentPeriodStartsAt: number | null | undefined,
  currentPeriodEndsAt: number | null | undefined,
  nextBilledAt: number | null | undefined,
) {
  const trialDays = resolveFreeProPlusTrialDays();
  if (trialDays <= 0) return false;
  const startsAt =
    typeof currentPeriodStartsAt === "number" ? currentPeriodStartsAt : null;
  const endsAt =
    typeof currentPeriodEndsAt === "number"
      ? currentPeriodEndsAt
      : typeof nextBilledAt === "number"
        ? nextBilledAt
        : null;
  if (startsAt === null || endsAt === null || endsAt <= startsAt) return false;
  return endsAt - startsAt <= trialDays * 86_400_000;
}

function webhookFinalizesCheckoutSession(
  status: string | null | undefined,
  currentPeriodEndsAt: number | null | undefined,
  nextBilledAt: number | null | undefined,
  requiresPriceMappingReview: boolean,
  now: number,
) {
  return (
    isSubscriptionEntitled(status, currentPeriodEndsAt, nextBilledAt, now) ||
    subscriptionRequiresBillingManagement(
      status,
      currentPeriodEndsAt,
      nextBilledAt,
      requiresPriceMappingReview,
      now,
    )
  );
}

function normalizedStatusEquals(status: string | null | undefined, expected: string) {
  return typeof status === "string" && status.trim().toLowerCase() === expected;
}

async function getUserTrialEligibilityState(
  db: BillingReadDb,
  user:
    | {
        _id: Id<"users">;
        trialRedeemedAt?: number;
        trialIneligibleAt?: number;
      }
    | null
    | undefined,
  subscriptions?: Doc<"subscriptions">[],
) {
  const trialDays = resolveFreeProPlusTrialDays();
  const historicalSubscriptionUse = !user
    ? false
    : (
        subscriptions ?? (await listManagedSubscriptionsForUser(db, user._id))
      ).some((row) => subscriptionConsumesTrialEligibility(row));
  return {
    trialDays,
    trialEligible:
      Boolean(user) &&
      trialDays > 0 &&
      !hasRecordedTrialIneligibility(user) &&
      !historicalSubscriptionUse,
  };
}

async function requireSupportOperator(ctx: AuthCtx) {
  const identity = await requireIdentity(ctx);
  const email = sanitizeEmail(typeof identity.email === "string" ? identity.email : undefined);
  if (!email || !SUPPORT_OPERATOR_EMAILS.has(email)) {
    throw new ConvexError("Unauthorized");
  }
  return { identity, email };
}

const OPEN_CHECKOUT_SESSION_WINDOW_MS = 10 * 60_000;

async function setUserPaddleCustomerId(
  db: BillingWriteDb,
  user: Pick<Doc<"users">, "_id" | "paddleCustomerId" | "updatedAt" | "lastSeenAt">,
  customerId: string,
  now: number,
  options?: { touchLastSeen?: boolean },
) {
  const matches = await listUsersByPaddleCustomerId(db, customerId);
  for (const match of matches) {
    if (match._id === user._id) continue;
    const subscriptions = await db
      .query("subscriptions")
      .withIndex("by_userId_updatedAt", (q) => q.eq("userId", match._id))
      .collect();
    for (const row of subscriptions) {
      if (row.paddleCustomerId !== customerId) continue;
      await db.patch(row._id, {
        userId: user._id,
        updatedAt: now,
      });
    }
    await db.patch(match._id, {
      paddleCustomerId: undefined,
      updatedAt: now,
    });
  }

  const patch: {
    paddleCustomerId?: string;
    updatedAt: number;
    lastSeenAt?: number;
  } = {
    updatedAt: now,
  };

  if (user.paddleCustomerId !== customerId) {
    patch.paddleCustomerId = customerId;
  }
  if (options?.touchLastSeen) {
    patch.lastSeenAt = now;
  }
  await db.patch(user._id, patch);
}

type WebhookUserResolution = {
  user: Doc<"users"> | null;
  source:
    | "none"
    | "existing_subscription"
    | "customer_id"
    | "external_id"
    | "checkout_session";
};

function pickWebhookUserResolution(
  candidates: Array<{
    user: Doc<"users"> | null;
    source: Exclude<WebhookUserResolution["source"], "none">;
    priority: number;
  }>,
): WebhookUserResolution {
  const bestByUserId = new Map<
    string,
    {
      user: Doc<"users">;
      source: Exclude<WebhookUserResolution["source"], "none">;
      priority: number;
    }
  >();

  for (const candidate of candidates) {
    if (!candidate.user) continue;
    const key = String(candidate.user._id);
    const existing = bestByUserId.get(key);
    if (!existing || candidate.priority > existing.priority) {
      bestByUserId.set(key, {
        user: candidate.user,
        source: candidate.source,
        priority: candidate.priority,
      });
    }
  }

  const ranked = [...bestByUserId.values()].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if ((a.user.updatedAt ?? 0) !== (b.user.updatedAt ?? 0)) {
      return (b.user.updatedAt ?? 0) - (a.user.updatedAt ?? 0);
    }
    if ((a.user.lastSeenAt ?? 0) !== (b.user.lastSeenAt ?? 0)) {
      return (b.user.lastSeenAt ?? 0) - (a.user.lastSeenAt ?? 0);
    }
    return (a.user.createdAt ?? 0) - (b.user.createdAt ?? 0);
  });

  const resolved = ranked[0];
  if (!resolved) {
    return {
      user: null,
      source: "none",
    };
  }

  return {
    user: resolved.user,
    source: resolved.source,
  };
}

function countDistinctWebhookUsers(
  candidates: Array<{
    user: Doc<"users"> | null;
  }>,
) {
  return new Set(
    candidates
      .map((candidate) => candidate.user?._id)
      .filter((value): value is Id<"users"> => Boolean(value)),
  ).size;
}

function pickCanonicalPaddleCustomerId(
  userCustomerId: string | undefined,
  primarySubscription:
    | { paddleCustomerId?: string | null }
    | null
    | undefined,
  subscriptions: Array<{ paddleCustomerId?: string | null }>,
) {
  if (
    typeof primarySubscription?.paddleCustomerId === "string" &&
    primarySubscription.paddleCustomerId.length > 0
  ) {
    return primarySubscription.paddleCustomerId;
  }
  const distinctCustomerIds = Array.from(
    new Set(
      subscriptions
        .map((row) => row.paddleCustomerId)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );
  if (
    typeof userCustomerId === "string" &&
    userCustomerId.length > 0 &&
    (distinctCustomerIds.length === 0 || distinctCustomerIds.includes(userCustomerId))
  ) {
    return userCustomerId;
  }
  if (distinctCustomerIds.length === 1) {
    return distinctCustomerIds[0];
  }
  return null;
}

function isStoredBillingPlan(value: string | undefined): value is BillingPlan {
  return value === "pro_monthly";
}

async function inferAppOwnedPlan(
  db: BillingReadDb,
  subscription:
    | {
        appPlan?: string;
        tier?: string;
        tierSourcePriceId?: string;
        priceId?: string;
      }
    | null
    | undefined,
): Promise<BillingPlan | null> {
  if (!subscription) return null;
  if (isStoredBillingPlan(subscription.appPlan)) {
    return subscription.appPlan;
  }
  const byTierSource = await resolveBillingPlanByPriceId(
    db,
    subscription.tierSourcePriceId,
  );
  if (byTierSource) return byTierSource;
  const byPriceId = await resolveBillingPlanByPriceId(db, subscription.priceId);
  if (byPriceId) return byPriceId;
  if (subscription.tier === "pro") {
    return "pro_monthly";
  }
  return null;
}

async function listManagedSubscriptionsForUser(
  db: BillingReadDb,
  userId: Id<"users">,
) {
  const allSubscriptions = await db
    .query("subscriptions")
    .withIndex("by_userId_updatedAt", (q) => q.eq("userId", userId))
    .order("desc")
    .collect();
  const recognizedEntries = await Promise.all(
    allSubscriptions.map(async (row) => ({
      row,
      appOwnedPlan: await inferAppOwnedPlan(db, row),
      recognized: await isRecognizedSubscription(db, row),
    })),
  );
  return recognizedEntries
    .filter((entry) => entry.recognized || entry.appOwnedPlan)
    .map((entry) => entry.row);
}

async function listRetryableIgnoredBillingEvents(
  db: BillingReadDb,
  filters: { userId?: Id<"users">; externalId?: string; customerId?: string },
) {
  const deduped = new Map<Id<"billingEvents">, Doc<"billingEvents">>();

  if (filters.externalId) {
    for (const status of RETRYABLE_IGNORED_EVENT_STATUSES) {
      const rows = await db
        .query("billingEvents")
        .withIndex("by_status_externalId", (q) =>
          q.eq("status", status).eq("externalId", filters.externalId!),
        )
        .collect();
      for (const row of rows) {
        deduped.set(row._id, row);
      }
    }
  }

  if (filters.customerId) {
    for (const status of RETRYABLE_IGNORED_EVENT_STATUSES) {
      const rows = await db
        .query("billingEvents")
        .withIndex("by_status_customerId", (q) =>
          q.eq("status", status).eq("paddleCustomerId", filters.customerId!),
        )
        .collect();
      for (const row of rows) {
        deduped.set(row._id, row);
      }
    }
  }

  if (filters.userId) {
    const checkoutSessions = await db
      .query("paddleCheckoutSessions")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", filters.userId!))
      .collect();
    for (const session of checkoutSessions) {
      const rows = await db
        .query("billingEvents")
        .withIndex("by_checkoutSessionId", (q) => q.eq("checkoutSessionId", session.sessionId))
        .collect();
      for (const row of rows) {
        if (
          row.status &&
          RETRYABLE_IGNORED_EVENT_STATUSES.includes(
            row.status as RetryableIgnoredBillingEventStatus,
          )
        ) {
          deduped.set(row._id, row);
        }
      }
    }
  }

  const rows = [...deduped.values()];
  const filtered: Doc<"billingEvents">[] = [];
  for (const row of rows) {
    const externalIdMatched =
      Boolean(filters.externalId) && row.externalId === filters.externalId;
    const customerIdMatched =
      Boolean(filters.customerId) && row.paddleCustomerId === filters.customerId;
    let checkoutSessionMatched = false;
    if (filters.userId && row.checkoutSessionId) {
      const checkoutSession = await db
        .query("paddleCheckoutSessions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", row.checkoutSessionId!))
        .first();
      checkoutSessionMatched = checkoutSession?.userId === filters.userId;
    }

    if (externalIdMatched || checkoutSessionMatched) {
      filtered.push(row);
      continue;
    }

    if (customerIdMatched) {
      filtered.push(row);
    }
  }

  return filtered.sort((a, b) => (b.processedAt ?? 0) - (a.processedAt ?? 0));
}

function getCheckoutSessionReviewAnchor(
  row: Pick<Doc<"paddleCheckoutSessions">, "createdAt" | "verifiedCompletedAt">,
) {
  return typeof row.verifiedCompletedAt === "number" && !Number.isNaN(row.verifiedCompletedAt)
    ? row.verifiedCompletedAt
    : row.createdAt;
}

async function hasStrongCheckoutSessionWebhookEvidence(
  db: BillingReadDb,
  checkoutSessionId: string,
) {
  const rows = await db
    .query("billingEvents")
    .withIndex("by_checkoutSessionId", (q) => q.eq("checkoutSessionId", checkoutSessionId))
    .collect();
  return rows.some((row) =>
    row.status === "processed" &&
    webhookFinalizesCheckoutSession(
      normalizeSubscriptionStatus(row.eventType, row.subscriptionStatus),
      toMillis(row.currentPeriodEndsAt ?? undefined),
      toMillis(row.nextBilledAt ?? undefined),
      false,
      Date.now(),
    ),
  );
}

async function listPendingWebhookCheckoutSessions(
  db: BillingReadDb,
  userId: Id<"users">,
) {
  const rows = await db
    .query("paddleCheckoutSessions")
    .withIndex("by_userId_createdAt", (q) => q.eq("userId", userId))
    .order("desc")
    .collect();
  const rowsWithEvidence = await Promise.all(
    rows.map(async (row) => ({
      row,
      hasWebhookEvidence: await hasStrongCheckoutSessionWebhookEvidence(db, row.sessionId),
    })),
  );
  return rowsWithEvidence
    .filter(
      ({ row, hasWebhookEvidence }) =>
        typeof row.completedAt !== "number" &&
        !Number.isNaN(getCheckoutSessionReviewAnchor(row)) &&
        (typeof row.verifiedCompletedAt === "number" || hasWebhookEvidence),
    )
    .map(({ row, hasWebhookEvidence }) => ({ ...row, hasWebhookEvidence }));
}

function splitPendingWebhookCheckoutSessions(
  sessions: Array<Doc<"paddleCheckoutSessions"> & { hasWebhookEvidence: boolean }>,
  now: number,
) {
  const verifiedPending = sessions.filter(
    (row) =>
      typeof row.verifiedCompletedAt === "number" &&
      !row.hasWebhookEvidence &&
      now - getCheckoutSessionReviewAnchor(row) < VERIFIED_CHECKOUT_WEBHOOK_GRACE_MS,
  );
  const webhookPending = sessions.filter(
    (row) =>
      row.hasWebhookEvidence &&
      now - getCheckoutSessionReviewAnchor(row) < CHECKOUT_WEBHOOK_GRACE_MS,
  );
  const stale = sessions.filter(
    (row) =>
      (row.hasWebhookEvidence &&
        now - getCheckoutSessionReviewAnchor(row) >= CHECKOUT_WEBHOOK_GRACE_MS) ||
      (typeof row.verifiedCompletedAt === "number" &&
        !row.hasWebhookEvidence &&
        now - getCheckoutSessionReviewAnchor(row) >= VERIFIED_CHECKOUT_WEBHOOK_GRACE_MS),
  );
  const abandoned = sessions.filter(
    (row) =>
      typeof row.verifiedCompletedAt !== "number" &&
      !row.hasWebhookEvidence &&
      now - getCheckoutSessionReviewAnchor(row) >= CHECKOUT_WEBHOOK_GRACE_MS,
  );
  return { pending: [...verifiedPending, ...webhookPending], stale, abandoned };
}

function listRetryableIgnoredBillingIssueCodes(
  events: Array<Pick<Doc<"billingEvents">, "status">>,
) {
  const issueCodes = new Set<string>();
  for (const event of events) {
    switch (event.status as RetryableIgnoredBillingEventStatus) {
      case "ignored_unknown_plan":
        issueCodes.add("pending_unknown_plan_event");
        break;
      case "ignored_conflicting_owner":
        issueCodes.add("pending_conflicting_owner_event");
        break;
      case "ignored_missing_user":
        issueCodes.add("pending_missing_user_event");
        break;
      default:
        issueCodes.add("pending_billing_event");
        break;
    }
  }
  return [...issueCodes];
}

function listPendingCheckoutIssueCodes(
  sessions: Array<Pick<Doc<"paddleCheckoutSessions">, "verifiedCompletedAt">>,
) {
  return sessions.length > 0 ? ["checkout_pending_webhook"] : [];
}

function listRecoverableSubscriptionIssueCodes(
  subscriptions: Array<
    Pick<
      Doc<"subscriptions">,
      "status" | "requiresPriceMappingReview" | "currentPeriodEndsAt" | "nextBilledAt"
    >
  >,
) {
  const issueCodes = new Set<string>();
  for (const row of subscriptions) {
    const normalizedStatus = row.status?.trim().toLowerCase() ?? null;
    const storedPeriodEndsAt = row.currentPeriodEndsAt ?? row.nextBilledAt ?? null;
    if (row.requiresPriceMappingReview) {
      issueCodes.add("price_mapping_review");
      continue;
    }
    if (
      (normalizedStatus === "active" ||
        normalizedStatus === "trialing" ||
        normalizedStatus === "canceled") &&
      typeof storedPeriodEndsAt !== "number"
    ) {
      issueCodes.add("missing_period_dates");
      continue;
    }
    if (normalizedStatus === "past_due") {
      issueCodes.add("subscription_past_due");
      continue;
    }
    if (normalizedStatus === "paused") {
      issueCodes.add("subscription_paused");
      continue;
    }
    issueCodes.add("recoverable_subscription");
  }
  return [...issueCodes];
}

function listMerchantReviewIssueCodes(
  subscriptions: Array<
    Pick<
      Doc<"subscriptions">,
      | "status"
      | "currentPeriodEndsAt"
      | "nextBilledAt"
      | "requiresPriceMappingReview"
      | "paddleCustomerId"
      | "paddleSubscriptionId"
    >
  >,
  now: number,
) {
  const issueCodes = new Set<string>();
  for (const row of subscriptions) {
    if (!subscriptionNeedsMerchantReview(row, now)) continue;
    if (row.requiresPriceMappingReview) {
      issueCodes.add("price_mapping_review");
    }
    const normalizedStatus = row.status?.trim().toLowerCase() ?? null;
    const storedPeriodEndsAt = row.currentPeriodEndsAt ?? row.nextBilledAt ?? null;
    if (
      (normalizedStatus === "active" || normalizedStatus === "trialing") &&
      typeof storedPeriodEndsAt !== "number"
    ) {
      issueCodes.add("missing_period_dates");
    }
    if (
      typeof row.paddleCustomerId !== "string" ||
      row.paddleCustomerId.length === 0 ||
      typeof row.paddleSubscriptionId !== "string" ||
      row.paddleSubscriptionId.length === 0
    ) {
      issueCodes.add("missing_portal_identifiers");
    }
  }
  if (issueCodes.size === 0 && subscriptions.length > 0) {
    issueCodes.add("manual_billing_review");
  }
  return [...issueCodes];
}

function listRecoverableCustomerIds(
  subscriptions: Array<
    Pick<Doc<"subscriptions">, "paddleCustomerId" | "status" | "currentPeriodEndsAt" | "nextBilledAt">
  >,
  now: number,
) {
  return Array.from(
    new Set(
      subscriptions
        .filter((row) => subscriptionHasRecoverableBillingLinkage(row, now))
        .map((row) => row.paddleCustomerId)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );
}

function buildMerchantReviewContext(
  subscriptions: Doc<"subscriptions">[],
  pendingIgnoredEvents: Doc<"billingEvents">[],
  pendingCheckoutSessions: Doc<"paddleCheckoutSessions">[],
  now: number,
) {
  const recoverableSubscriptions = subscriptions.filter((row) =>
    subscriptionHasRecoverableBillingLinkage(row, now),
  );
  const merchantReviewSubscriptions = subscriptions.filter((row) =>
    subscriptionNeedsMerchantReview(row, now),
  );
  const recoverableCustomerIds = listRecoverableCustomerIds(subscriptions, now);
  const hasRecoverableCustomerConflict = recoverableCustomerIds.length > 1;
  const reviewSubscriptions = hasRecoverableCustomerConflict
    ? Array.from(
        new Map(
          [...merchantReviewSubscriptions, ...recoverableSubscriptions].map((row) => [
            row._id,
            row,
          ]),
        ).values(),
      )
    : Array.from(
        new Map(
          [...merchantReviewSubscriptions, ...recoverableSubscriptions].map((row) => [
            row._id,
            row,
          ]),
        ).values(),
      );
  const issueCodes = Array.from(
    new Set([
      ...listMerchantReviewIssueCodes(merchantReviewSubscriptions, now),
      ...listRecoverableSubscriptionIssueCodes(recoverableSubscriptions),
      ...listRetryableIgnoredBillingIssueCodes(pendingIgnoredEvents),
      ...listPendingCheckoutIssueCodes(pendingCheckoutSessions),
      ...(hasRecoverableCustomerConflict ? ["multiple_recoverable_customer_ids"] : []),
    ]),
  );

  return {
    recoverableSubscriptions,
    merchantReviewSubscriptions,
    recoverableCustomerIds,
    hasRecoverableCustomerConflict,
    reviewSubscriptions,
    issueCodes,
    merchantReviewRequired:
      reviewSubscriptions.length > 0 ||
      pendingIgnoredEvents.length > 0 ||
      pendingCheckoutSessions.length > 0 ||
      hasRecoverableCustomerConflict,
  };
}

async function reconcileBillingRecoveryCases(
  db: BillingWriteDb,
  user: Doc<"users">,
  reviewSubscriptions: Doc<"subscriptions">[],
  pendingIgnoredEvents: Doc<"billingEvents">[],
  pendingCheckoutSessions: Doc<"paddleCheckoutSessions">[],
  issueCodes: string[],
  now: number,
) {
  const openCases = await db
    .query("billingRecoveryCases")
    .withIndex("by_user_status", (q) => q.eq("userId", user._id))
    .collect();
  const activeOpenCases = openCases.filter((row) => row.status === "open");

  if (
    reviewSubscriptions.length === 0 &&
    pendingIgnoredEvents.length === 0 &&
    pendingCheckoutSessions.length === 0
  ) {
    for (const row of activeOpenCases) {
      await db.patch(row._id, {
        status: "resolved",
        resolvedAt: now,
        updatedAt: now,
      });
    }
    return null;
  }

  const paddleCustomerId =
    pickCanonicalPaddleCustomerId(
      user.paddleCustomerId,
      pickEffectiveSubscription(reviewSubscriptions, now),
      reviewSubscriptions,
    ) ??
    pendingIgnoredEvents.find(
      (row) => typeof row.paddleCustomerId === "string" && row.paddleCustomerId.length > 0,
    )?.paddleCustomerId ??
    pendingCheckoutSessions.find(
      (row) => typeof row.paddleCustomerId === "string" && row.paddleCustomerId.length > 0,
    )?.paddleCustomerId ??
    undefined;
  const paddleSubscriptionIds = Array.from(
    new Set(
      [...reviewSubscriptions, ...pendingIgnoredEvents]
        .map((row) => row.paddleSubscriptionId)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );
  const [primaryCase, ...duplicateCases] = [...activeOpenCases].sort(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
  );

  if (primaryCase) {
    await db.patch(primaryCase._id, {
      externalId: user.externalId,
      issueCodes,
      paddleCustomerId,
      paddleSubscriptionIds,
      updatedAt: now,
      lastDetectedAt: now,
      resolvedAt: undefined,
    });
    for (const duplicate of duplicateCases) {
      await db.patch(duplicate._id, {
        status: "resolved",
        resolvedAt: now,
        updatedAt: now,
      });
    }
    return primaryCase._id;
  }

  return await db.insert("billingRecoveryCases", {
    userId: user._id,
    externalId: user.externalId,
    status: "open",
    issueCodes,
    paddleCustomerId,
    paddleSubscriptionIds,
    createdAt: now,
    updatedAt: now,
    lastDetectedAt: now,
  });
}

function listUnresolvedCreatedSubscriptions(
  subscriptions: Doc<"subscriptions">[],
  now: number,
) {
  const createdCutoff = now - CHECKOUT_WEBHOOK_GRACE_MS;
  return subscriptions.filter((row) => {
    const normalizedStatus = row.status?.trim().toLowerCase() ?? null;
    if (normalizedStatus !== "created") return false;
    const versionTime =
      row.lastSubscriptionUpdatedAt ??
      row.lastEventOccurredAt ??
      row.updatedAt ??
      row.createdAt;
    return versionTime >= createdCutoff;
  });
}

export const syncCurrentUser = mutationGeneric({
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const now = Date.now();

    const initialUser = await ensureCanonicalAuthUser(ctx.db, {
      provider: getIdentityClaim(identity, "provider"),
      providerSubject: getIdentityClaim(identity, "providerSubject"),
      externalIdHint: identity.subject,
      email: sanitizeEmail(typeof identity.email === "string" ? identity.email : undefined),
      name: typeof identity.name === "string" ? identity.name : undefined,
      imageUrl: getIdentityImageUrl(identity),
      now,
    });
    await replayIgnoredBillingEvents(ctx, {
      userId: initialUser._id,
      externalId: initialUser.externalId,
      customerId: initialUser.paddleCustomerId,
    });
    const user = (await ctx.db.get(initialUser._id)) ?? initialUser;
    const subscriptions = await listManagedSubscriptionsForUser(ctx.db, user._id);
    const pendingIgnoredEvents = await listRetryableIgnoredBillingEvents(ctx.db, {
      userId: user._id,
      externalId: user.externalId,
      customerId: user.paddleCustomerId,
    });
    const allPendingCheckoutSessions = await listPendingWebhookCheckoutSessions(ctx.db, user._id);
    const {
      stale: pendingCheckoutSessions,
    } = splitPendingWebhookCheckoutSessions(allPendingCheckoutSessions, now);
    const merchantReview = buildMerchantReviewContext(
      subscriptions,
      pendingIgnoredEvents,
      pendingCheckoutSessions,
      now,
    );
    await reconcileBillingRecoveryCases(
      ctx.db,
      user,
      merchantReview.reviewSubscriptions,
      pendingIgnoredEvents,
      pendingCheckoutSessions,
      merchantReview.issueCodes,
      now,
    );
    return {
      userId: user._id,
      externalId: user.externalId,
      paddleCustomerId: user.paddleCustomerId ?? null,
    };
  },
});

export const setMyPaddleCustomerId = mutationGeneric({
  args: {
    forwardSecret: v.optional(v.string()),
    testSecret: v.optional(v.string()),
    customerId: v.string(),
  },
  handler: async (ctx, { forwardSecret, testSecret, customerId }) => {
    const expectedSecret = process.env.PADDLE_WEBHOOK_FORWARD_SECRET;
    const testAllowed =
      Boolean(process.env.E2E_TEST_SECRET) &&
      testSecret === process.env.E2E_TEST_SECRET;
    const forwardAllowed =
      Boolean(expectedSecret) && forwardSecret === expectedSecret;
    if (!testAllowed && !forwardAllowed) {
      throw new ConvexError("Unauthorized");
    }
    const identity = await requireIdentity(ctx);
    const existing = await findUserForIdentity(ctx.db, identity);
    if (!existing) {
      throw new ConvexError("User not found. Run syncCurrentUser first.");
    }
    const now = Date.now();
    await setUserPaddleCustomerId(ctx.db, existing, customerId, now, {
      touchLastSeen: true,
    });
    await replayIgnoredBillingEvents(ctx, {
      userId: existing._id,
      externalId: existing.externalId,
      customerId,
    });
    return { userId: existing._id, customerId };
  },
});

export const getMyOnboardingState = queryGeneric({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        isAuthenticated: false,
        hasCompletedOnboarding: false,
      };
    }

    const user = await findUserForIdentity(ctx.db, identity);

    return {
      isAuthenticated: true,
      hasCompletedOnboarding: Boolean(user?.onboardingCompletedAt),
      onboardingCompletedAt: user?.onboardingCompletedAt ?? null,
    };
  },
});

export const markOnboardingComplete = mutationGeneric({
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const now = Date.now();
    const user = await findUserForIdentity(ctx.db, identity);

    if (!user) {
      throw new ConvexError("User not found. Run syncCurrentUser first.");
    }

    if (!user.onboardingCompletedAt) {
      await ctx.db.patch(user._id, {
        onboardingCompletedAt: now,
        updatedAt: now,
        lastSeenAt: now,
      });
    } else {
      await ctx.db.patch(user._id, {
        updatedAt: now,
        lastSeenAt: now,
      });
    }

    return {
      userId: user._id,
      onboardingCompletedAt: user.onboardingCompletedAt ?? now,
    };
  },
});

export const resetMyOnboardingForTesting = mutationGeneric({
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const now = Date.now();
    const user = await findUserForIdentity(ctx.db, identity);

    if (!user) {
      throw new ConvexError("User not found. Run syncCurrentUser first.");
    }

    // Keep value numeric to satisfy schema while evaluating falsey in onboarding checks.
    await ctx.db.patch(user._id, {
      onboardingCompletedAt: 0,
      updatedAt: now,
      lastSeenAt: now,
    });

    return {
      userId: user._id,
      onboardingCompletedAt: 0,
      hasCompletedOnboarding: false,
    };
  },
});

export const resetMyBillingForTesting = mutationGeneric({
  args: {
    testSecret: v.string(),
  },
  handler: async (ctx, { testSecret }) => {
    ensureTestingAllowed(testSecret);
    const identity = await requireIdentity(ctx);
    const user = await findUserForIdentity(ctx.db, identity);

    if (!user) {
      throw new ConvexError("User not found. Run syncCurrentUser first.");
    }

    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_userId_updatedAt", (q) => q.eq("userId", user._id))
      .collect();
    const checkoutSessions = await ctx.db
      .query("paddleCheckoutSessions")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", user._id))
      .collect();
    const billingEvents = (await ctx.db.query("billingEvents").collect()).filter(
      (row) =>
        row.userId === user._id ||
        row.externalId === user.externalId ||
        (typeof user.paddleCustomerId === "string" && row.paddleCustomerId === user.paddleCustomerId),
    );
    const recoveryCases = await ctx.db
      .query("billingRecoveryCases")
      .withIndex("by_user_status", (q) => q.eq("userId", user._id))
      .collect();

    for (const row of subscriptions) {
      await ctx.db.delete(row._id);
    }
    for (const row of checkoutSessions) {
      await ctx.db.delete(row._id);
    }
    for (const row of billingEvents) {
      await ctx.db.delete(row._id);
    }
    for (const row of recoveryCases) {
      await ctx.db.delete(row._id);
    }

    await ctx.db.patch(user._id, {
      paddleCustomerId: undefined,
      trialRedeemedAt: undefined,
      trialIneligibleAt: undefined,
      manualAccessTier: undefined,
      manualAccessEndsAt: undefined,
      manualAccessReason: undefined,
      manualAccessGrantedBy: undefined,
      updatedAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    return {
      userId: user._id,
      deletedSubscriptions: subscriptions.length,
    };
  },
});

export const getMySubscriptionSnapshotForTesting = queryGeneric({
  args: {
    testSecret: v.string(),
  },
  handler: async (ctx, { testSecret }) => {
    ensureTestingAllowed(testSecret);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Unauthorized");
    }
    const user = await findUserForIdentity(ctx.db, identity);
    if (!user) {
      return {
        userExists: false as const,
      };
    }
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_userId_updatedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();

    return {
      userExists: true as const,
      paddleCustomerId: user.paddleCustomerId ?? null,
      manualAccessTier: user.manualAccessTier ?? null,
      manualAccessEndsAt: user.manualAccessEndsAt ?? null,
      manualAccessReason: user.manualAccessReason ?? null,
      subscriptionStatus: subscription?.status ?? null,
      paddleSubscriptionId: subscription?.paddleSubscriptionId ?? null,
      paddlePriceId: subscription?.priceId ?? null,
      currentPeriodStartsAt: subscription?.currentPeriodStartsAt ?? null,
      currentPeriodEndsAt: subscription?.currentPeriodEndsAt ?? null,
      nextBilledAt: subscription?.nextBilledAt ?? null,
      updatedAt: subscription?.updatedAt ?? null,
    };
  },
});

export const setMyManualAccessForTesting = mutationGeneric({
  args: {
    testSecret: v.string(),
    tier: v.union(v.literal("pro"), v.literal("pro_plus"), v.null()),
    endsAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { testSecret, tier, endsAt }) => {
    ensureTestingAllowed(testSecret);
    const identity = await requireIdentity(ctx);
    const user = await findUserForIdentity(ctx.db, identity);

    if (!user) {
      throw new ConvexError("User not found. Run syncCurrentUser first.");
    }

    const now = Date.now();
    await ctx.db.patch(user._id, {
      manualAccessTier: tier ?? undefined,
      manualAccessEndsAt: tier ? (endsAt ?? undefined) : undefined,
      manualAccessReason: tier ? "test_override" : undefined,
      manualAccessGrantedBy: tier ? "e2e" : undefined,
      updatedAt: now,
      lastSeenAt: now,
    });

    return {
      userId: user._id,
      tier,
      endsAt: tier ? (endsAt ?? null) : null,
    };
  },
});

export const getMyBilling = queryGeneric({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        isAuthenticated: false,
        hasUserRecord: false,
        plan: "inactive",
        isActive: false,
        hasPremiumVoice: false,
        trialActive: false,
        trialEndsAt: null as number | null,
        accessEndsAt: null as number | null,
        trialEligible: resolveFreeProPlusTrialDays() > 0,
        checkoutPendingConfirmation: false,
        accessSource: "none" as const,
        subscriptionEntitled: false,
        premiumVoiceSource: "none" as "none" | "trial" | "pro_preview" | "pro_plus",
        merchantReviewRequired: false,
        merchantReviewCaseId: null as Id<"billingRecoveryCases"> | null,
        merchantReviewIssueCodes: [] as string[],
        manualAccessTier: null as string | null,
        manualAccessEndsAt: null as number | null,
        manualAccessReason: null as string | null,
        proPreviewQuotaChars: null as number | null,
        proPreviewUsedChars: null as number | null,
        proPreviewRemainingChars: null as number | null,
        subscriptionStatus: null as string | null,
        paddleCustomerId: null as string | null,
        paddleSubscriptionId: null as string | null,
        paddleSubscriptionIds: [] as string[],
        billingPortalAvailable: false,
        billingPortalSubscriptionIds: [] as string[],
        blockingSubscriptionIds: [] as string[],
        paddlePriceId: null as string | null,
      };
    }

    const user = await findUserForIdentity(ctx.db, identity);
    if (!user) {
      return {
        isAuthenticated: true,
        hasUserRecord: false,
        plan: "inactive",
        isActive: false,
        hasPremiumVoice: false,
        trialActive: false,
        trialEndsAt: null as number | null,
        accessEndsAt: null as number | null,
        trialEligible: resolveFreeProPlusTrialDays() > 0,
        checkoutPendingConfirmation: false,
        accessSource: "none" as const,
        subscriptionEntitled: false,
        premiumVoiceSource: "none" as "none" | "trial" | "pro_preview" | "pro_plus",
        manualAccessTier: null as string | null,
        manualAccessEndsAt: null as number | null,
        manualAccessReason: null as string | null,
        proPreviewQuotaChars: null as number | null,
        proPreviewUsedChars: null as number | null,
        proPreviewRemainingChars: null as number | null,
        subscriptionStatus: null as string | null,
        paddleCustomerId: null as string | null,
        paddleSubscriptionId: null as string | null,
        paddleSubscriptionIds: [] as string[],
        billingPortalAvailable: false,
        billingPortalSubscriptionIds: [] as string[],
        blockingSubscriptionIds: [] as string[],
        paddlePriceId: null as string | null,
      };
    }

    const subscriptions = await listManagedSubscriptionsForUser(ctx.db, user._id);
    const now = Date.now();
    const unresolvedCreatedSubscriptions = listUnresolvedCreatedSubscriptions(
      subscriptions,
      now,
    );
    const pendingIgnoredEvents = await listRetryableIgnoredBillingEvents(ctx.db, {
      userId: user._id,
      externalId: user.externalId,
      customerId: user.paddleCustomerId,
    });
    const allPendingCheckoutSessions = await listPendingWebhookCheckoutSessions(ctx.db, user._id);
    const {
      pending: checkoutPendingConfirmationSessions,
      stale: pendingCheckoutSessions,
    } = splitPendingWebhookCheckoutSessions(allPendingCheckoutSessions, now);
    const recognizedSubscriptions = (
      await Promise.all(
        subscriptions.map(async (row) => ({
          row,
          recognized: await isRecognizedSubscription(ctx.db, row),
        })),
      )
    )
      .filter(({ recognized }) => recognized)
      .map(({ row }) => row);
    const subscription = pickEffectiveSubscription(recognizedSubscriptions, now);
    const effectivePaddleCustomerId = pickCanonicalPaddleCustomerId(
      user.paddleCustomerId,
      pickEffectiveSubscription(subscriptions, now),
      subscriptions,
    );
    const merchantReview = buildMerchantReviewContext(
      subscriptions,
      pendingIgnoredEvents,
      pendingCheckoutSessions,
      now,
    );
    const recoverableSubscriptions = merchantReview.recoverableSubscriptions;
    const merchantReviewSubscriptions = merchantReview.merchantReviewSubscriptions;
    const merchantReviewRequired = merchantReview.merchantReviewRequired;
    const openRecoveryCase = merchantReviewRequired
      ? (
          await ctx.db
            .query("billingRecoveryCases")
            .withIndex("by_user_status", (q) => q.eq("userId", user._id))
            .collect()
        ).find((row) => row.status === "open") ?? null
      : null;
    const recoverableCustomerIds = merchantReview.recoverableCustomerIds;
    const billingManagementCustomerId =
      recoverableSubscriptions.length === 0
        ? effectivePaddleCustomerId
        : recoverableCustomerIds.length === 1
          ? recoverableCustomerIds[0]
          : recoverableCustomerIds.length === 0
            ? effectivePaddleCustomerId
          : null;
    const paddleSubscriptionIds = Array.from(
      new Set(
        subscriptions
          .filter((row) => {
            if (!row.paddleSubscriptionId) return false;
            if (!billingManagementCustomerId) return false;
            return (
              subscriptionHasRecoverableBillingLinkage(row, now) &&
              (!row.paddleCustomerId || row.paddleCustomerId === billingManagementCustomerId)
            );
          })
          .map((row) => row.paddleSubscriptionId),
      ),
    );
    const billingPortalSubscriptionIds = Array.from(
      new Set(
        [
          subscription?.paddleSubscriptionId &&
          billingManagementCustomerId &&
          subscription.requiresPriceMappingReview !== true &&
          (!subscription.paddleCustomerId ||
            subscription.paddleCustomerId === billingManagementCustomerId)
            ? subscription.paddleSubscriptionId
            : null,
          ...paddleSubscriptionIds,
        ].filter((value): value is string => typeof value === "string" && value.length > 0),
      ),
    );
    const billingPortalAvailable =
      typeof billingManagementCustomerId === "string" &&
      billingManagementCustomerId.length > 0 &&
      billingPortalSubscriptionIds.length > 0;
    const blockingSubscriptionIds = Array.from(
      new Set(
        [...recoverableSubscriptions, ...merchantReviewSubscriptions, ...pendingIgnoredEvents]
          .filter((row) => {
            if (!row.paddleSubscriptionId) return false;
            return true;
          })
          .map((row) => row.paddleSubscriptionId),
      ),
    );
    const status = subscription?.status ?? null;
    const paidAccess = await resolvePaidPlanAccess(
      ctx.db,
      subscription,
      user,
      now,
    );
    const isActive = paidAccess.isActive;
    const trialActive = paidAccess.trialActive;
    const trialEndsAt = paidAccess.trialEndsAt;
    const tier = paidAccess.tier;
    const hasPremiumVoice = paidAccess.hasPremiumVoice;
    const premiumVoiceSource = paidAccess.premiumVoiceSource;
    const { trialEligible } = await getUserTrialEligibilityState(
      ctx.db,
      user,
      subscriptions,
    );
    const checkoutPendingConfirmation =
      checkoutPendingConfirmationSessions.length > 0 ||
      unresolvedCreatedSubscriptions.length > 0;
    const hasEffectiveManualAccess = paidAccess.accessSource === "manual";
    const manualAccessTier = hasEffectiveManualAccess ? user.manualAccessTier ?? null : null;
    const manualAccessEndsAt = hasEffectiveManualAccess ? user.manualAccessEndsAt ?? null : null;
    const manualAccessReason = hasEffectiveManualAccess ? user.manualAccessReason ?? null : null;
    const accessEndsAt = hasEffectiveManualAccess
      ? user.manualAccessEndsAt ?? null
      : paidAccess.subscriptionEntitled
        ? (subscription?.currentPeriodEndsAt ?? subscription?.nextBilledAt ?? null)
        : null;

    let proPreviewQuotaChars: number | null = null;
    let proPreviewUsedChars: number | null = null;
    let proPreviewRemainingChars: number | null = null;

    if (isActive && tier === "pro" && !hasPremiumVoice) {
      const quota = resolveProPreviewQuotaChars();
      const monthKey = getCurrentMonthKey(now);
      const previewRows = await ctx.db
        .query("featureUsageMonthly")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_user_feature_month", (q: any) =>
          q.eq("userId", user._id)
            .eq("feature", PREMIUM_TTS_PREVIEW_FEATURE)
            .eq("monthKey", monthKey),
        )
        .collect();
      const used = previewRows.reduce((sum, row) => sum + row.usedUnits, 0);
      proPreviewQuotaChars = quota;
      proPreviewUsedChars = used;
      proPreviewRemainingChars = Math.max(0, quota - used);
    }

    return {
      isAuthenticated: true,
      hasUserRecord: true,
      plan: tier,
      isActive,
      hasPremiumVoice,
      trialActive,
      trialEndsAt,
      accessEndsAt,
      trialEligible,
      checkoutPendingConfirmation,
      accessSource: paidAccess.accessSource,
      subscriptionEntitled: paidAccess.subscriptionEntitled,
      premiumVoiceSource,
      merchantReviewRequired,
      merchantReviewCaseId: openRecoveryCase?._id ?? null,
      merchantReviewIssueCodes: merchantReviewRequired ? merchantReview.issueCodes : [],
      manualAccessTier,
      manualAccessEndsAt,
      manualAccessReason,
      proPreviewQuotaChars,
      proPreviewUsedChars,
      proPreviewRemainingChars,
      subscriptionStatus: status,
      paddleCustomerId: billingManagementCustomerId,
      paddleSubscriptionId: subscription?.paddleSubscriptionId ?? null,
      paddleSubscriptionIds,
      billingPortalAvailable,
      billingPortalSubscriptionIds,
      blockingSubscriptionIds,
      paddlePriceId: subscription?.priceId ?? null,
      paddleTier: isStoredBillingTier(subscription?.tier) ? subscription.tier : null,
    };
  },
});

export const getBillingPlansPublic = queryGeneric({
  handler: async (ctx) => {
    const trialDays = resolveFreeProPlusTrialDays();
    const plans = await Promise.all(
      listPublicBillingPlanConfigs().map(async (config) => {
        const trialEligible = config.trialEligible && trialDays > 0;
        const priceId = await resolveCheckoutPlanPriceId(ctx.db, config.plan, {
          trialEligible,
        });
        return {
          plan: config.plan,
          tier: config.tier,
          interval: config.interval,
          trialEligible,
          priceId,
          checkoutEnabled: Boolean(priceId),
        };
      }),
    );

    return {
      trialDays,
      plans,
    };
  },
});

export const getCheckoutPlanConfig = queryGeneric({
  args: {
    plan: v.literal("pro_monthly"),
    trialEligible: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { plan, trialEligible }: { plan: "pro_monthly"; trialEligible?: boolean },
  ) => {
    const resolvedTrialEligible = trialEligible !== false;
    const priceId = await resolveCheckoutPlanPriceId(ctx.db, plan, {
      trialEligible: resolvedTrialEligible,
    });
    return {
      plan,
      priceId,
      trialEligible: resolvedTrialEligible,
      checkoutEnabled: Boolean(priceId),
    };
  },
});

export const getMyCheckoutPlanConfig = queryGeneric({
  args: {
    plan: v.literal("pro_monthly"),
  },
  handler: async (ctx, { plan }: { plan: "pro_monthly" }) => {
    const identity = await ctx.auth.getUserIdentity();
    const anonymousTrialDays = resolveFreeProPlusTrialDays();
    if (!identity) {
      const priceId = await resolveCheckoutPlanPriceId(ctx.db, plan, {
        trialEligible: anonymousTrialDays > 0,
      });
      return {
        plan,
        trialEligible: anonymousTrialDays > 0,
        trialDays: anonymousTrialDays,
        priceId,
        checkoutEnabled: Boolean(priceId),
      };
    }

    const user = await findUserForIdentity(ctx.db, identity);
    const subscriptions = user ? await listManagedSubscriptionsForUser(ctx.db, user._id) : [];
    const { trialDays, trialEligible } = await getUserTrialEligibilityState(
      ctx.db,
      user,
      subscriptions,
    );
    const priceId = await resolveCheckoutPlanPriceId(ctx.db, plan, {
      trialEligible,
    });
    return {
      plan,
      trialEligible,
      trialDays,
      priceId,
      checkoutEnabled: Boolean(priceId),
    };
  },
});

export const adminSetManualAccess = mutationGeneric({
  args: {
    email: v.string(),
    tier: v.union(v.literal("pro"), v.literal("pro_plus"), v.null()),
    endsAt: v.optional(v.union(v.number(), v.null())),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { email, tier, endsAt, reason }) => {
    const { email: grantedBy } = await requireSupportOperator(ctx);
    const normalizedEmail = sanitizeEmail(email);
    if (!normalizedEmail) {
      throw new ConvexError("User email is required");
    }
    const user = await findCanonicalUserByEmail(ctx.db, normalizedEmail);
    if (!user) {
      throw new ConvexError("User not found");
    }

    const normalizedReason = reason?.trim();
    const now = Date.now();
    if (tier === null) {
      const subscriptions = await listManagedSubscriptionsForUser(ctx.db, user._id);
      await ctx.db.patch(user._id, {
        manualAccessTier: undefined,
        manualAccessEndsAt: undefined,
        manualAccessReason: undefined,
        manualAccessGrantedBy: undefined,
        trialIneligibleAt:
          typeof user.trialRedeemedAt !== "number" && subscriptions.length === 0
            ? undefined
            : user.trialIneligibleAt,
        updatedAt: now,
      });
      return {
        userId: user._id,
        email: normalizedEmail,
        tier: null,
        endsAt: null,
      };
    }

    await ctx.db.patch(user._id, {
      manualAccessTier: tier,
      manualAccessEndsAt: endsAt ?? undefined,
      manualAccessReason:
        normalizedReason && normalizedReason.length > 0 ? normalizedReason : undefined,
      manualAccessGrantedBy: grantedBy,
      updatedAt: now,
    });

    return {
      userId: user._id,
      email: normalizedEmail,
      tier,
      endsAt: endsAt ?? null,
    };
  },
});

export const createCheckoutSession = mutationGeneric({
  args: {
    sessionId: v.string(),
    plan: v.literal("pro_monthly"),
    priceId: v.string(),
  },
  handler: async (ctx, { sessionId, plan, priceId }) => {
    const identity = await requireIdentity(ctx);
    const user = await findUserForIdentity(ctx.db, identity);
    if (!user) {
      throw new ConvexError("User not found. Run syncCurrentUser first.");
    }
    const subscriptions = await listManagedSubscriptionsForUser(ctx.db, user._id);
    const { trialEligible } = await getUserTrialEligibilityState(
      ctx.db,
      user,
      subscriptions,
    );
    const expectedPriceId = await resolveCheckoutPlanPriceId(ctx.db, plan, {
      trialEligible,
    });
    if (!expectedPriceId) {
      throw new ConvexError(`Checkout is not configured for ${plan}`);
    }
    if (priceId !== expectedPriceId) {
      throw new ConvexError("Checkout price does not match the configured plan");
    }
    const now = Date.now();
    const recognizedSubscriptions = (
      await Promise.all(
        subscriptions.map(async (row) => ({
          row,
          recognized: await isRecognizedSubscription(ctx.db, row),
        })),
      )
    )
      .filter(({ recognized }) => recognized)
      .map(({ row }) => row);
    const currentAccess = await resolvePaidPlanAccess(
      ctx.db,
      pickEffectiveSubscription(recognizedSubscriptions, now),
      user,
      now,
    );
    if (currentAccess.isActive) {
      if (currentAccess.accessSource === "manual") {
        throw new ConvexError("Complimentary access already exists");
      }
      throw new ConvexError("Active access already exists");
    }
    const unresolvedCreatedSubscriptions = listUnresolvedCreatedSubscriptions(
      subscriptions,
      now,
    );
    const recoverableSubscriptions = subscriptions.filter((row) =>
      subscriptionHasRecoverableBillingLinkage(row, now),
    );
    const pendingIgnoredEvents = await listRetryableIgnoredBillingEvents(ctx.db, {
      userId: user._id,
      externalId: user.externalId,
      customerId: user.paddleCustomerId,
    });
    const allPendingCheckoutSessions = await listPendingWebhookCheckoutSessions(ctx.db, user._id);
    const {
      pending: checkoutPendingConfirmationSessions,
      stale: pendingCheckoutSessions,
    } = splitPendingWebhookCheckoutSessions(allPendingCheckoutSessions, now);
    const merchantReview = buildMerchantReviewContext(
      subscriptions,
      pendingIgnoredEvents,
      pendingCheckoutSessions,
      now,
    );
    if (checkoutPendingConfirmationSessions.length > 0) {
      throw new ConvexError("Checkout confirmation pending");
    }
    if (unresolvedCreatedSubscriptions.length > 0) {
      throw new ConvexError("Checkout confirmation pending");
    }
    if (recoverableSubscriptions.length > 0) {
      await reconcileBillingRecoveryCases(
        ctx.db,
        user,
        merchantReview.reviewSubscriptions,
        pendingIgnoredEvents,
        pendingCheckoutSessions,
        merchantReview.issueCodes,
        now,
      );
      throw new ConvexError("Subscription requires merchant review");
    }
    if (merchantReview.merchantReviewRequired) {
      await reconcileBillingRecoveryCases(
        ctx.db,
        user,
        merchantReview.reviewSubscriptions,
        pendingIgnoredEvents,
        pendingCheckoutSessions,
        merchantReview.issueCodes,
        now,
      );
      throw new ConvexError("Subscription requires merchant review");
    }
    const openSessionCutoff = now - OPEN_CHECKOUT_SESSION_WINDOW_MS;
    const existingOpenSession = (
      await ctx.db
        .query("paddleCheckoutSessions")
        .withIndex("by_userId_createdAt", (q) => q.eq("userId", user._id))
        .order("desc")
        .collect()
    ).find((row) => !row.completedAt && row.createdAt >= openSessionCutoff);
    if (existingOpenSession) {
      throw new ConvexError("Checkout already in progress");
    }
    const existing = await ctx.db
      .query("paddleCheckoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();
    if (existing) {
      throw new ConvexError("Checkout session already exists");
    }
    await ctx.db.insert("paddleCheckoutSessions", {
      sessionId,
      userId: user._id,
      externalId: user.externalId,
      plan,
      priceId,
      createdAt: now,
      updatedAt: now,
      paddleCustomerId: user.paddleCustomerId,
    });
    return { sessionId };
  },
});

export const getCheckoutSessionVerificationContext = queryGeneric({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    const identity = await requireIdentity(ctx);
    const user = await findUserForIdentity(ctx.db, identity);
    if (!user) {
      return null;
    }

    const checkoutSession = await ctx.db
      .query("paddleCheckoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();
    if (!checkoutSession || checkoutSession.userId !== user._id) {
      return null;
    }

    return {
      sessionId: checkoutSession.sessionId,
      plan: checkoutSession.plan,
      priceId: checkoutSession.priceId,
      externalId: checkoutSession.externalId,
      paddleCustomerId: checkoutSession.paddleCustomerId ?? null,
    };
  },
});

export const markCheckoutCompletedFromVerification = mutationGeneric({
  args: {
    sessionId: v.string(),
    transactionId: v.string(),
    paddleCustomerId: v.optional(v.string()),
    paddleSubscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    subscriptionUpdatedAt: v.optional(v.string()),
    priceId: v.optional(v.string()),
    priceIds: v.optional(v.array(v.string())),
    productId: v.optional(v.string()),
    currentPeriodStartsAt: v.optional(v.union(v.string(), v.null())),
    currentPeriodEndsAt: v.optional(v.union(v.string(), v.null())),
    nextBilledAt: v.optional(v.union(v.string(), v.null())),
    canceledAt: v.optional(v.union(v.string(), v.null())),
    startedWithTrial: v.optional(v.boolean()),
    canceledDuringTrial: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    {
      sessionId,
      transactionId,
      paddleCustomerId,
      paddleSubscriptionId,
      subscriptionStatus,
      subscriptionUpdatedAt,
      priceId,
      priceIds,
      productId,
      currentPeriodStartsAt,
      currentPeriodEndsAt,
      nextBilledAt,
      canceledAt,
      startedWithTrial,
      canceledDuringTrial,
    },
  ) => {
    const identity = await requireIdentity(ctx);
    const user = await findUserForIdentity(ctx.db, identity);
    if (!user) {
      throw new ConvexError("User not found. Run syncCurrentUser first.");
    }

    const checkoutSession = await ctx.db
      .query("paddleCheckoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();
    if (!checkoutSession || checkoutSession.userId !== user._id) {
      throw new ConvexError("Checkout session not found");
    }

    const now = Date.now();

    if (paddleSubscriptionId) {
      await applyVerifiedSubscriptionSnapshot(ctx, {
        user,
        checkoutSession,
        snapshot: {
          subscriptionId: paddleSubscriptionId,
          customerId: paddleCustomerId,
          subscriptionStatus,
          subscriptionUpdatedAt,
          priceId,
          priceIds,
          productId,
          currentPeriodStartsAt,
          currentPeriodEndsAt,
          nextBilledAt,
          canceledAt,
          startedWithTrial,
          canceledDuringTrial,
        },
        now,
      });
    }

    await ctx.db.patch(checkoutSession._id, {
      clientCompletedAt: checkoutSession.clientCompletedAt ?? now,
      verifiedCompletedAt: checkoutSession.verifiedCompletedAt ?? now,
      verifiedTransactionId: checkoutSession.verifiedTransactionId ?? transactionId,
      paddleCustomerId:
        checkoutSession.paddleCustomerId ?? paddleCustomerId ?? user.paddleCustomerId,
      paddleSubscriptionId: checkoutSession.paddleSubscriptionId ?? paddleSubscriptionId,
      updatedAt: now,
    });

    const subscriptions = await listManagedSubscriptionsForUser(ctx.db, user._id);
    const pendingIgnoredEvents = await listRetryableIgnoredBillingEvents(ctx.db, {
      userId: user._id,
      externalId: user.externalId,
      customerId: user.paddleCustomerId,
    });
    const allPendingCheckoutSessions = await listPendingWebhookCheckoutSessions(ctx.db, user._id);
    const { stale: pendingCheckoutSessions } = splitPendingWebhookCheckoutSessions(
      allPendingCheckoutSessions,
      now,
    );
    const merchantReview = buildMerchantReviewContext(
      subscriptions,
      pendingIgnoredEvents,
      pendingCheckoutSessions,
      now,
    );
    await reconcileBillingRecoveryCases(
      ctx.db,
      user,
      merchantReview.reviewSubscriptions,
      pendingIgnoredEvents,
      pendingCheckoutSessions,
      merchantReview.issueCodes,
      now,
    );

    return {
      sessionId,
      verifiedCompletedAt: checkoutSession.verifiedCompletedAt ?? now,
      verifiedTransactionId: checkoutSession.verifiedTransactionId ?? transactionId,
    };
  },
});

export const abandonCheckoutSession = mutationGeneric({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, { sessionId }) => {
    const identity = await requireIdentity(ctx);
    const user = await findUserForIdentity(ctx.db, identity);
    if (!user) {
      throw new ConvexError("User not found. Run syncCurrentUser first.");
    }

    const checkoutSession = await ctx.db
      .query("paddleCheckoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();
    if (!checkoutSession || checkoutSession.userId !== user._id) {
      throw new ConvexError("Checkout session not found");
    }
    if (typeof checkoutSession.completedAt === "number") {
      return { removed: false, reason: "completed" as const };
    }
    if (typeof checkoutSession.verifiedCompletedAt === "number") {
      return { removed: false, reason: "verified_completed" as const };
    }
    if (await hasStrongCheckoutSessionWebhookEvidence(ctx.db, checkoutSession.sessionId)) {
      return { removed: false, reason: "webhook_evidence" as const };
    }

    await ctx.db.delete(checkoutSession._id);
    return { removed: true, reason: "abandoned" as const };
  },
});

function buildWebhookArgsFromBillingEvent(event: Doc<"billingEvents">): PaddleWebhookArgs {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt: typeof event.occurredAt === "number" ? new Date(event.occurredAt).toISOString() : undefined,
    checkoutSessionId: event.checkoutSessionId,
    subscriptionId: event.paddleSubscriptionId,
    customerId: event.paddleCustomerId,
    externalId: event.externalId,
    subscriptionUpdatedAt: event.subscriptionUpdatedAt,
    subscriptionStatus: event.subscriptionStatus,
    priceId: event.priceId,
    priceIds: event.priceIds,
    productId: event.productId,
    currentPeriodStartsAt: event.currentPeriodStartsAt,
    currentPeriodEndsAt: event.currentPeriodEndsAt,
    nextBilledAt: event.nextBilledAt,
    canceledAt: event.canceledAt,
    rawBody: event.rawBody,
  };
}

function listWebhookPriceCandidates(args: Pick<PaddleWebhookArgs, "priceId" | "priceIds">) {
  return Array.from(
    new Set(
      [args.priceId, ...(args.priceIds ?? [])].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    ),
  );
}

async function resolveWebhookBillingPriceId(
  db: BillingReadDb,
  args: Pick<PaddleWebhookArgs, "priceId" | "priceIds">,
) {
  const candidates = listWebhookPriceCandidates(args);
  for (const candidate of candidates) {
    if (await resolveBillingTierByPriceId(db, candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function applyVerifiedSubscriptionSnapshot(
  ctx: { db: BillingWriteDb },
  {
    user,
    checkoutSession,
    snapshot,
    now,
  }: {
    user: Doc<"users">;
    checkoutSession: Doc<"paddleCheckoutSessions">;
    snapshot: VerifiedSubscriptionSnapshot;
    now: number;
  },
) {
  const existingSubscription = await findCanonicalSubscriptionByPaddleSubscriptionId(
    ctx.db,
    snapshot.subscriptionId,
  );
  const incomingVersionTime = toMillis(snapshot.subscriptionUpdatedAt) ?? now;
  const currentVersionTime =
    existingSubscription?.lastSubscriptionUpdatedAt ??
    existingSubscription?.lastEventOccurredAt;
  if (
    currentVersionTime !== undefined &&
    (incomingVersionTime < currentVersionTime ||
      (incomingVersionTime === currentVersionTime &&
        existingSubscription?.lastEventType &&
        existingSubscription.lastEventType !== "transaction.verified"))
  ) {
    const currentShouldComplete = existingSubscription
      ? webhookFinalizesCheckoutSession(
          existingSubscription.status,
          existingSubscription.currentPeriodEndsAt,
          existingSubscription.nextBilledAt,
          existingSubscription.requiresPriceMappingReview === true,
          now,
        )
      : false;
    await ctx.db.patch(checkoutSession._id, {
      updatedAt: now,
      paddleCustomerId:
        existingSubscription?.paddleCustomerId ??
        snapshot.customerId ??
        checkoutSession.paddleCustomerId,
      paddleSubscriptionId: snapshot.subscriptionId ?? checkoutSession.paddleSubscriptionId,
      completedAt: currentShouldComplete ? now : checkoutSession.completedAt,
    });
    return;
  }
  const existingAppPlan = await inferAppOwnedPlan(ctx.db, existingSubscription);
  const checkoutSessionPlan = isStoredBillingPlan(checkoutSession.plan)
    ? checkoutSession.plan
    : null;
  const resolvedPriceId = await resolveWebhookBillingPriceId(ctx.db, {
    priceId: snapshot.priceId,
    priceIds: snapshot.priceIds,
  });
  const verificationPriceCandidates = listWebhookPriceCandidates({
    priceId: snapshot.priceId,
    priceIds: snapshot.priceIds,
  });
  const hasExplicitVerificationPrice = verificationPriceCandidates.length > 0;
  const checkoutSessionPriceMatched = Boolean(
    !hasExplicitVerificationPrice && checkoutSession.priceId,
  );
  const resolvedAppPlan =
    checkoutSessionPlan ??
    existingAppPlan ??
    (resolvedPriceId ? await resolveBillingPlanByPriceId(ctx.db, resolvedPriceId) : null);
  if (!resolvedAppPlan) {
    throw new ConvexError("Verified subscription does not match an app plan");
  }

  const existingTier = isStoredBillingTier(existingSubscription?.tier)
    ? existingSubscription.tier
    : undefined;
  const checkoutSessionTier = checkoutSessionPriceMatched
    ? resolveBillingTierByPlan(checkoutSession.plan)
    : null;
  const explicitUnknownManagedPrice = Boolean(
    hasExplicitVerificationPrice && resolvedAppPlan && !resolvedPriceId,
  );
  const resolvedTier =
    resolvedPriceId
      ? await resolveBillingTierByPriceId(ctx.db, resolvedPriceId)
      : explicitUnknownManagedPrice &&
          (existingTier ??
            checkoutSessionTier ??
            resolveBillingTierByPlan(resolvedAppPlan ?? undefined))
        ? (existingTier ??
            checkoutSessionTier ??
            resolveBillingTierByPlan(resolvedAppPlan ?? undefined))
        : hasExplicitVerificationPrice
          ? undefined
          : existingTier ?? checkoutSessionTier ?? undefined;
  const normalizedStatus =
    typeof snapshot.subscriptionStatus === "string" &&
    snapshot.subscriptionStatus.trim().length > 0
      ? snapshot.subscriptionStatus.trim().toLowerCase()
      : "unknown";
  const entitled = isSubscriptionEntitled(
    normalizedStatus,
    toMillis(snapshot.currentPeriodEndsAt),
    toMillis(snapshot.nextBilledAt),
    now,
  );
  const shouldCompleteCheckoutSession = webhookFinalizesCheckoutSession(
    normalizedStatus,
    toMillis(snapshot.currentPeriodEndsAt),
    toMillis(snapshot.nextBilledAt),
    explicitUnknownManagedPrice,
    now,
  );

  if (snapshot.customerId) {
    await setUserPaddleCustomerId(ctx.db, user, snapshot.customerId, now);
  } else {
    await ctx.db.patch(user._id, {
      updatedAt: now,
    });
  }

  if (entitled && typeof user.trialIneligibleAt !== "number") {
    await ctx.db.patch(user._id, {
      trialIneligibleAt: now,
      updatedAt: now,
    });
  }

  if (
    snapshot.startedWithTrial &&
    entitled &&
    resolveFreeProPlusTrialDays() > 0 &&
    typeof user.trialRedeemedAt !== "number"
  ) {
    await ctx.db.patch(user._id, {
      trialRedeemedAt: now,
      updatedAt: now,
    });
  }

  await ctx.db.patch(checkoutSession._id, {
    updatedAt: now,
    paddleCustomerId: snapshot.customerId ?? checkoutSession.paddleCustomerId,
    paddleSubscriptionId: snapshot.subscriptionId ?? checkoutSession.paddleSubscriptionId,
    completedAt: shouldCompleteCheckoutSession ? now : checkoutSession.completedAt,
  });

  const patch: {
    userId?: Id<"users">;
    status: string;
    appPlan?: BillingPlan;
    startedWithTrial?: boolean;
    canceledDuringTrial?: boolean;
    requiresPriceMappingReview?: boolean;
    tier?: StoredBillingTier;
    tierSourcePriceId?: string;
    updatedAt: number;
    lastEventType: string;
    paddleCustomerId?: string;
    priceId?: string;
    productId?: string;
    currentPeriodStartsAt?: number;
    currentPeriodEndsAt?: number;
    nextBilledAt?: number;
    canceledAt?: number;
    lastEventOccurredAt?: number;
    lastSubscriptionUpdatedAt?: number;
  } = {
    status: normalizedStatus,
    appPlan: resolvedAppPlan,
    requiresPriceMappingReview: explicitUnknownManagedPrice ? true : undefined,
    updatedAt: now,
    lastEventType: "transaction.verified",
    lastEventOccurredAt: now,
  };

  if (snapshot.startedWithTrial || existingSubscription?.startedWithTrial === true) {
    patch.startedWithTrial = true;
  }
  if (snapshot.canceledDuringTrial || existingSubscription?.canceledDuringTrial === true) {
    patch.canceledDuringTrial = true;
  }
  if (resolvedTier) {
    patch.tier = resolvedTier;
    patch.tierSourcePriceId =
      resolvedPriceId ?? (checkoutSessionPriceMatched ? checkoutSession.priceId : undefined);
    if (explicitUnknownManagedPrice && !patch.tierSourcePriceId) {
      patch.tierSourcePriceId =
        existingSubscription?.tierSourcePriceId ?? existingSubscription?.priceId;
    }
  } else if (!hasExplicitVerificationPrice && isStoredBillingTier(existingSubscription?.tier)) {
    patch.tier = existingSubscription.tier;
    patch.tierSourcePriceId =
      existingSubscription.tierSourcePriceId ?? existingSubscription.priceId;
  } else if (!hasExplicitVerificationPrice && checkoutSessionTier) {
    patch.tier = checkoutSessionTier;
    patch.tierSourcePriceId = checkoutSession.priceId;
  }
  if (snapshot.subscriptionUpdatedAt !== undefined) {
    const lastSubscriptionUpdatedAt = toMillis(snapshot.subscriptionUpdatedAt);
    if (lastSubscriptionUpdatedAt !== undefined) {
      patch.lastSubscriptionUpdatedAt = lastSubscriptionUpdatedAt;
    }
  }
  if (existingSubscription && existingSubscription.userId !== user._id) {
    patch.userId = user._id;
  }
  if (snapshot.customerId) patch.paddleCustomerId = snapshot.customerId;
  if (resolvedPriceId) {
    patch.priceId = resolvedPriceId;
  } else if (hasExplicitVerificationPrice) {
    patch.priceId = verificationPriceCandidates[0];
  } else if (checkoutSessionPriceMatched && checkoutSession.priceId) {
    patch.priceId = checkoutSession.priceId;
  }
  if (snapshot.productId) patch.productId = snapshot.productId;
  if (snapshot.currentPeriodStartsAt !== undefined) {
    if (snapshot.currentPeriodStartsAt === null) {
      patch.currentPeriodStartsAt = undefined;
    } else {
      const currentPeriodStartsAt = toMillis(snapshot.currentPeriodStartsAt);
      if (currentPeriodStartsAt !== undefined) {
        patch.currentPeriodStartsAt = currentPeriodStartsAt;
      }
    }
  }
  if (snapshot.currentPeriodEndsAt !== undefined) {
    if (snapshot.currentPeriodEndsAt === null) {
      patch.currentPeriodEndsAt = undefined;
    } else {
      const currentPeriodEndsAt = toMillis(snapshot.currentPeriodEndsAt);
      if (currentPeriodEndsAt !== undefined) {
        patch.currentPeriodEndsAt = currentPeriodEndsAt;
      }
    }
  }
  if (snapshot.nextBilledAt !== undefined) {
    if (snapshot.nextBilledAt === null) {
      patch.nextBilledAt = undefined;
    } else {
      const nextBilledAt = toMillis(snapshot.nextBilledAt);
      if (nextBilledAt !== undefined) {
        patch.nextBilledAt = nextBilledAt;
      }
    }
  }
  if (snapshot.canceledAt !== undefined) {
    if (snapshot.canceledAt === null) {
      patch.canceledAt = undefined;
    } else {
      const canceledAt = toMillis(snapshot.canceledAt);
      if (canceledAt !== undefined) {
        patch.canceledAt = canceledAt;
      }
    }
  }

  if (existingSubscription) {
    await ctx.db.patch(existingSubscription._id, patch);
  } else {
    await ctx.db.insert("subscriptions", {
      userId: user._id,
      paddleSubscriptionId: snapshot.subscriptionId,
      paddleCustomerId: snapshot.customerId,
      status: normalizedStatus,
      appPlan: resolvedAppPlan,
      ...(patch.startedWithTrial === true ? { startedWithTrial: true } : {}),
      ...(patch.canceledDuringTrial === true ? { canceledDuringTrial: true } : {}),
      ...(patch.tier
        ? {
            tier: patch.tier,
            tierSourcePriceId: patch.tierSourcePriceId,
          }
        : {}),
      priceId: patch.priceId,
      productId: patch.productId,
      currentPeriodStartsAt: patch.currentPeriodStartsAt,
      currentPeriodEndsAt: patch.currentPeriodEndsAt,
      nextBilledAt: patch.nextBilledAt,
      canceledAt: patch.canceledAt,
      createdAt: now,
      updatedAt: now,
      lastEventType: "transaction.verified",
      lastEventOccurredAt: now,
      lastSubscriptionUpdatedAt: patch.lastSubscriptionUpdatedAt,
    });
  }
}

async function applyPaddleWebhookEvent(
  ctx: { db: BillingWriteDb },
  args: PaddleWebhookArgs,
  existingEvent: Doc<"billingEvents"> | null = null,
) {
  const retryableIgnoredEvent = Boolean(
    existingEvent?.status &&
      RETRYABLE_IGNORED_EVENT_STATUSES.includes(
        existingEvent.status as RetryableIgnoredBillingEventStatus,
      ),
  );
  if (existingEvent && !retryableIgnoredEvent) {
    return { duplicate: true, eventId: args.eventId };
  }

  const now = Date.now();
  const occurredAt = toMillis(args.occurredAt);
  const subscriptionUpdatedAt = toMillis(args.subscriptionUpdatedAt);
  const incomingEventTime = occurredAt ?? now;
  const incomingVersionTime = subscriptionUpdatedAt ?? incomingEventTime;

  let userId: Id<"users"> | undefined;
  const subscriptionId = args.subscriptionId;
  const existingSubscription = await findCanonicalSubscriptionByPaddleSubscriptionId(
    ctx.db,
    args.subscriptionId,
  );
  const checkoutSession = args.checkoutSessionId
    ? await ctx.db
        .query("paddleCheckoutSessions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", args.checkoutSessionId!))
        .first()
    : null;

  const existingSubscriptionOwner = existingSubscription
    ? await ctx.db.get(existingSubscription.userId)
    : null;
  const checkoutSessionUser = checkoutSession ? await ctx.db.get(checkoutSession.userId) : null;
  const externalIdUser = args.externalId
    ? await findCanonicalUserByExternalId(ctx.db, args.externalId)
    : null;
  const customerIdUser = args.customerId
    ? await findCanonicalUserByPaddleCustomerId(ctx.db, args.customerId)
    : null;
  const ownershipEvidence = [
    { user: checkoutSessionUser, source: "checkout_session" as const, priority: 4 },
    { user: externalIdUser, source: "external_id" as const, priority: 3 },
    { user: customerIdUser, source: "customer_id" as const, priority: 2 },
  ];
  const conflictingExistingOwnerEvidence = Boolean(
    existingSubscriptionOwner &&
      ownershipEvidence.some(
        (candidate) => candidate.user && candidate.user._id !== existingSubscriptionOwner._id,
      ),
  );
  const conflictingFirstSeenOwnerEvidence = Boolean(
    !existingSubscriptionOwner && countDistinctWebhookUsers(ownershipEvidence) > 1,
  );
  const webhookUserResolution = existingSubscriptionOwner
    ? {
        user: existingSubscriptionOwner,
        source: "existing_subscription" as const,
      }
    : pickWebhookUserResolution(ownershipEvidence);

  const user = webhookUserResolution.user;

  let processingStatus: BillingEventProcessingStatus = user
    ? "processed"
    : "ignored_missing_user";

  if (existingSubscription) {
    const currentVersionTime =
      existingSubscription.lastSubscriptionUpdatedAt ??
      existingSubscription.lastEventOccurredAt;
    const currentEventTime = existingSubscription.lastEventOccurredAt;
    if (
      currentVersionTime !== undefined &&
      (incomingVersionTime < currentVersionTime ||
        (incomingVersionTime === currentVersionTime &&
          currentEventTime !== undefined &&
          incomingEventTime < currentEventTime))
    ) {
      processingStatus = "ignored_stale_event";
    }
  }
  if (
    processingStatus === "processed" &&
    (conflictingExistingOwnerEvidence || conflictingFirstSeenOwnerEvidence)
  ) {
    processingStatus = "ignored_conflicting_owner";
  }

  const resolvedPriceId =
    processingStatus === "processed" && args.subscriptionId
      ? await resolveWebhookBillingPriceId(ctx.db, args)
      : undefined;
  const webhookPriceCandidates = listWebhookPriceCandidates(args);
  const hasExplicitWebhookPrice = webhookPriceCandidates.length > 0;
  const checkoutSessionPriceMatched = Boolean(
    !hasExplicitWebhookPrice &&
      checkoutSession?.priceId,
  );
  const existingAppPlan = await inferAppOwnedPlan(ctx.db, existingSubscription);
  const checkoutSessionPlan = isStoredBillingPlan(checkoutSession?.plan)
    ? checkoutSession.plan
    : null;
  const resolvedAppPlan =
    checkoutSessionPlan ??
    existingAppPlan ??
    (resolvedPriceId ? await resolveBillingPlanByPriceId(ctx.db, resolvedPriceId) : null);
  const existingTier = isStoredBillingTier(existingSubscription?.tier)
    ? existingSubscription.tier
    : undefined;
  const checkoutSessionTier = checkoutSessionPriceMatched
    ? resolveBillingTierByPlan(checkoutSession?.plan)
    : null;
  const explicitUnknownManagedPrice = Boolean(
    hasExplicitWebhookPrice && resolvedAppPlan && !resolvedPriceId,
  );
  // Policy: if Paddle sends a new/unmapped price for a subscription we can still
  // prove belongs to one of our app plans, preserve the last known app tier and
  // mark mapping review instead of failing closed and cutting off paid access.
  const resolvedTier =
    resolvedPriceId && processingStatus === "processed"
      ? await resolveBillingTierByPriceId(ctx.db, resolvedPriceId)
      : explicitUnknownManagedPrice &&
          (existingTier ??
            checkoutSessionTier ??
            resolveBillingTierByPlan(resolvedAppPlan ?? undefined))
        ? (existingTier ??
            checkoutSessionTier ??
            resolveBillingTierByPlan(resolvedAppPlan ?? undefined))
      : hasExplicitWebhookPrice
        ? undefined
        : existingTier ?? checkoutSessionTier ?? undefined;
  const managesAppPlan = Boolean(resolvedAppPlan);
  const normalizedStatus = normalizeSubscriptionStatus(
    args.eventType,
    args.subscriptionStatus,
  );
  const trialPriceMatched = Boolean(
    resolvedAppPlan &&
      (
        await Promise.all(
          [
            resolvedPriceId,
            checkoutSession?.priceId,
            args.priceId,
            ...(args.priceIds ?? []),
          ]
            .filter((value, index, values): value is string =>
              typeof value === "string" && value.length > 0 && values.indexOf(value) === index,
            )
            .map((priceId) =>
              isTrialEligibleBillingPriceId(ctx.db, resolvedAppPlan, priceId),
            ),
        )
      ).some(Boolean),
  );
  const shouldCompleteCheckoutSession = webhookFinalizesCheckoutSession(
    normalizedStatus,
    toMillis(args.currentPeriodEndsAt),
    toMillis(args.nextBilledAt),
    explicitUnknownManagedPrice,
    now,
  );
  if (
    processingStatus === "processed" &&
    args.subscriptionId &&
    !managesAppPlan
  ) {
    processingStatus = "ignored_unknown_plan";
  }

  if (processingStatus === "processed" && user) {
    userId = user._id;
    if (args.customerId) {
      await setUserPaddleCustomerId(ctx.db, user, args.customerId, now);
    } else {
      await ctx.db.patch(user._id, {
        updatedAt: now,
      });
    }
    if (
      resolvedAppPlan &&
      isSubscriptionEntitled(
        normalizedStatus,
        toMillis(args.currentPeriodEndsAt),
        toMillis(args.nextBilledAt),
        now,
      ) &&
      typeof user.trialIneligibleAt !== "number"
    ) {
      await ctx.db.patch(user._id, {
        trialIneligibleAt: now,
        updatedAt: now,
      });
    }
    if (
      trialPriceMatched &&
      isSubscriptionEntitled(
        normalizedStatus,
        toMillis(args.currentPeriodEndsAt),
        toMillis(args.nextBilledAt),
        now,
      ) &&
      resolveFreeProPlusTrialDays() > 0 &&
      typeof user.trialRedeemedAt !== "number"
    ) {
      await ctx.db.patch(user._id, {
        trialRedeemedAt: now,
        updatedAt: now,
      });
    }
  }

  if (processingStatus === "processed" && checkoutSession) {
    await ctx.db.patch(checkoutSession._id, {
      updatedAt: now,
      paddleCustomerId: args.customerId ?? checkoutSession.paddleCustomerId,
      paddleSubscriptionId: args.subscriptionId ?? checkoutSession.paddleSubscriptionId,
      completedAt:
        args.subscriptionId && shouldCompleteCheckoutSession
          ? now
          : checkoutSession.completedAt,
    });
  }

  if (processingStatus === "processed" && user && args.subscriptionId) {
    const patch: {
      userId?: Id<"users">;
      status: string;
      appPlan?: BillingPlan;
      startedWithTrial?: boolean;
      canceledDuringTrial?: boolean;
      requiresPriceMappingReview?: boolean;
      tier?: StoredBillingTier;
      tierSourcePriceId?: string;
      updatedAt: number;
      lastEventType: string;
      paddleCustomerId?: string;
      priceId?: string;
      productId?: string;
      currentPeriodStartsAt?: number;
      currentPeriodEndsAt?: number;
      nextBilledAt?: number;
      canceledAt?: number;
      lastEventOccurredAt?: number;
      lastSubscriptionUpdatedAt?: number;
    } = {
      status: normalizedStatus,
      requiresPriceMappingReview: explicitUnknownManagedPrice ? true : undefined,
      updatedAt: now,
      lastEventType: args.eventType,
      lastEventOccurredAt: incomingEventTime,
    };
    if (resolvedAppPlan) {
      patch.appPlan = resolvedAppPlan;
    }
    const existingSubscriptionWasTrialing = normalizedStatusEquals(
      existingSubscription?.status,
      "trialing",
    );
    const canceledTrialInferredFromCurrentWindow =
      normalizedStatus === "canceled" &&
      trialPriceMatched &&
      isShortTrialWindow(
        toMillis(args.currentPeriodStartsAt),
        toMillis(args.currentPeriodEndsAt),
        toMillis(args.nextBilledAt),
      );
    if (
      existingSubscription?.startedWithTrial === true ||
      (normalizedStatus === "trialing" && trialPriceMatched) ||
      (normalizedStatus === "canceled" && canceledTrialInferredFromCurrentWindow)
    ) {
      patch.startedWithTrial = true;
    }
    if (
      existingSubscription?.canceledDuringTrial === true ||
      (normalizedStatus === "canceled" &&
        (canceledTrialInferredFromCurrentWindow ||
          existingSubscriptionWasTrialing ||
          existingSubscription?.startedWithTrial === true))
    ) {
      patch.canceledDuringTrial = true;
    }
    if (resolvedTier) {
      patch.tier = resolvedTier;
      patch.tierSourcePriceId = resolvedPriceId ?? (checkoutSessionPriceMatched ? checkoutSession?.priceId : undefined);
      if (explicitUnknownManagedPrice && !patch.tierSourcePriceId) {
        patch.tierSourcePriceId =
          existingSubscription?.tierSourcePriceId ??
          existingSubscription?.priceId;
      }
    } else if (!hasExplicitWebhookPrice && isStoredBillingTier(existingSubscription?.tier)) {
      patch.tier = existingSubscription.tier;
      patch.tierSourcePriceId =
        existingSubscription.tierSourcePriceId ?? existingSubscription.priceId;
    } else if (!hasExplicitWebhookPrice && checkoutSessionTier) {
      patch.tier = checkoutSessionTier;
      patch.tierSourcePriceId = checkoutSession?.priceId;
    } else if (hasExplicitWebhookPrice) {
      patch.tier = undefined;
      patch.tierSourcePriceId = undefined;
    }
    if (subscriptionUpdatedAt !== undefined) {
      patch.lastSubscriptionUpdatedAt = subscriptionUpdatedAt;
    }
    if (
      existingSubscription &&
      !existingSubscriptionOwner &&
      existingSubscription.userId !== user._id
    ) {
      patch.userId = user._id;
    }

    if (args.customerId) patch.paddleCustomerId = args.customerId;
    if (resolvedPriceId) {
      patch.priceId = resolvedPriceId;
    } else if (hasExplicitWebhookPrice) {
      patch.priceId = webhookPriceCandidates[0];
    } else if (checkoutSessionPriceMatched && checkoutSession?.priceId) {
      patch.priceId = checkoutSession.priceId;
    }
    if (args.productId) patch.productId = args.productId;
    if (args.currentPeriodStartsAt !== undefined) {
      if (args.currentPeriodStartsAt === null) {
        patch.currentPeriodStartsAt = undefined;
      } else {
        const currentPeriodStartsAt = toMillis(args.currentPeriodStartsAt);
        if (currentPeriodStartsAt !== undefined) {
          patch.currentPeriodStartsAt = currentPeriodStartsAt;
        }
      }
    }
    if (args.currentPeriodEndsAt !== undefined) {
      if (args.currentPeriodEndsAt === null) {
        patch.currentPeriodEndsAt = undefined;
      } else {
        const currentPeriodEndsAt = toMillis(args.currentPeriodEndsAt);
        if (currentPeriodEndsAt !== undefined) {
          patch.currentPeriodEndsAt = currentPeriodEndsAt;
        }
      }
    }
    if (args.nextBilledAt !== undefined) {
      if (args.nextBilledAt === null) {
        patch.nextBilledAt = undefined;
      } else {
        const nextBilledAt = toMillis(args.nextBilledAt);
        if (nextBilledAt !== undefined) {
          patch.nextBilledAt = nextBilledAt;
        }
      }
    }
    if (args.canceledAt !== undefined) {
      if (args.canceledAt === null) {
        patch.canceledAt = undefined;
      } else {
        const canceledAt = toMillis(args.canceledAt);
        if (canceledAt !== undefined) {
          patch.canceledAt = canceledAt;
        }
      }
    }

    if (existingSubscription) {
      await ctx.db.patch(existingSubscription._id, patch);
    } else {
      const currentPeriodStartsAt =
        args.currentPeriodStartsAt === null
          ? undefined
          : toMillis(args.currentPeriodStartsAt);
      const currentPeriodEndsAt =
        args.currentPeriodEndsAt === null
          ? undefined
          : toMillis(args.currentPeriodEndsAt);
      const nextBilledAt =
        args.nextBilledAt === null
          ? undefined
          : toMillis(args.nextBilledAt);
      const canceledAt =
        args.canceledAt === null
          ? undefined
          : toMillis(args.canceledAt);
      await ctx.db.insert("subscriptions", {
        userId: user._id,
        paddleSubscriptionId: args.subscriptionId,
        paddleCustomerId: args.customerId,
        status: normalizedStatus,
        ...(resolvedAppPlan ? { appPlan: resolvedAppPlan } : {}),
        ...(normalizedStatus === "trialing" && trialPriceMatched
          ? { startedWithTrial: true }
          : {}),
        ...(normalizedStatus === "canceled" && canceledTrialInferredFromCurrentWindow
          ? { startedWithTrial: true, canceledDuringTrial: true }
          : {}),
        ...(resolvedTier
          ? {
              tier: resolvedTier,
              tierSourcePriceId:
                resolvedPriceId ??
                (checkoutSessionPriceMatched ? checkoutSession?.priceId : undefined),
            }
          : !hasExplicitWebhookPrice && checkoutSessionTier
            ? {
                tier: checkoutSessionTier,
                tierSourcePriceId: checkoutSession?.priceId,
              }
            : {}),
        priceId:
          resolvedPriceId ??
          (hasExplicitWebhookPrice
            ? webhookPriceCandidates[0]
            : checkoutSessionPriceMatched
              ? checkoutSession?.priceId
              : undefined),
        productId: args.productId,
        currentPeriodStartsAt,
        currentPeriodEndsAt,
        nextBilledAt,
        canceledAt,
        createdAt: now,
        updatedAt: now,
        lastEventType: args.eventType,
        lastEventOccurredAt: incomingEventTime,
        lastSubscriptionUpdatedAt: subscriptionUpdatedAt,
      });
    }
  }

  const billingEventPatch = {
    eventType: args.eventType,
    occurredAt,
    processedAt: now,
    status: processingStatus,
    userId,
    externalId: args.externalId,
    checkoutSessionId: args.checkoutSessionId,
    paddleSubscriptionId: subscriptionId,
    paddleCustomerId: args.customerId,
    subscriptionUpdatedAt: args.subscriptionUpdatedAt,
    subscriptionStatus: args.subscriptionStatus,
    priceId: args.priceId,
    priceIds: args.priceIds,
    productId: args.productId,
    currentPeriodStartsAt: args.currentPeriodStartsAt,
    currentPeriodEndsAt: args.currentPeriodEndsAt,
    nextBilledAt: args.nextBilledAt,
    canceledAt: args.canceledAt,
    rawBody: args.rawBody,
  };

  if (existingEvent) {
    await ctx.db.patch(existingEvent._id, billingEventPatch);
  } else {
    await ctx.db.insert("billingEvents", {
      eventId: args.eventId,
      ...billingEventPatch,
    });
  }

  return {
    duplicate: false,
    eventId: args.eventId,
    userResolved: Boolean(userId),
    stale: processingStatus === "ignored_stale_event",
    subscriptionId: subscriptionId ?? null,
  };
}

async function replayIgnoredBillingEvents(
  ctx: { db: BillingWriteDb },
  filters: { userId?: Id<"users">; externalId?: string; customerId?: string },
) {
  const uniqueRows = (await listRetryableIgnoredBillingEvents(ctx.db, filters)).sort((a, b) => {
    const aTime = a.occurredAt ?? a.processedAt;
    const bTime = b.occurredAt ?? b.processedAt;
    if (aTime !== bTime) return aTime - bTime;
    return a.processedAt - b.processedAt;
  });

  for (const row of uniqueRows) {
    await applyPaddleWebhookEvent(ctx, buildWebhookArgsFromBillingEvent(row), row);
  }
}

export const processPaddleWebhook = mutationGeneric({
  args: {
    forwardSecret: v.optional(v.string()),
    testSecret: v.optional(v.string()),
    eventId: v.string(),
    eventType: v.string(),
    occurredAt: v.optional(v.string()),
    subscriptionId: v.optional(v.string()),
    customerId: v.optional(v.string()),
    externalId: v.optional(v.string()),
    checkoutSessionId: v.optional(v.string()),
    subscriptionUpdatedAt: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    priceId: v.optional(v.string()),
    priceIds: v.optional(v.array(v.string())),
    productId: v.optional(v.string()),
    currentPeriodStartsAt: v.optional(v.union(v.string(), v.null())),
    currentPeriodEndsAt: v.optional(v.union(v.string(), v.null())),
    nextBilledAt: v.optional(v.union(v.string(), v.null())),
    canceledAt: v.optional(v.union(v.string(), v.null())),
    rawBody: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.PADDLE_WEBHOOK_FORWARD_SECRET;
    const testAllowed =
      Boolean(process.env.E2E_TEST_SECRET) &&
      args.testSecret === process.env.E2E_TEST_SECRET;
    const forwardAllowed =
      Boolean(expectedSecret) && args.forwardSecret === expectedSecret;
    if (!testAllowed && !forwardAllowed) {
      throw new ConvexError("Unauthorized webhook call");
    }

    const existingEvent = await ctx.db
      .query("billingEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();
    return await applyPaddleWebhookEvent(ctx, args, existingEvent);
  },
});
