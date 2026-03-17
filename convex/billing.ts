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
  listPublicBillingPlanConfigs,
  resolveBillingTierByPriceId,
  resolveCheckoutPlanPriceId,
} from "./billingPlans";
import {
  isSubscriptionEntitled,
  pickEffectiveSubscription,
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
  subscriptionId?: string;
  customerId?: string;
  externalId?: string;
  subscriptionUpdatedAt?: string;
  subscriptionStatus?: string;
  priceId?: string;
  productId?: string;
  currentPeriodStartsAt?: string | null;
  currentPeriodEndsAt?: string | null;
  nextBilledAt?: string | null;
  canceledAt?: string | null;
  rawBody?: string;
};

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

async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Unauthorized");
  }
  return identity;
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
  if (status && status.length > 0) return status;
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

const PREMIUM_TTS_FEATURE = "premium_tts";
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

async function listUsersByPaddleCustomerId(db: BillingReadDb, customerId: string) {
  return await db
    .query("users")
    .withIndex("by_paddleCustomerId", (q) => q.eq("paddleCustomerId", customerId))
    .collect();
}

async function findUniqueUserByPaddleCustomerId(db: BillingReadDb, customerId: string | undefined) {
  if (!customerId) return null;
  const matches = await listUsersByPaddleCustomerId(db, customerId);
  if (matches.length !== 1) return null;
  return matches[0];
}

async function findCanonicalUserByEmail(db: BillingReadDb, email: string | undefined) {
  if (!email) return null;
  const candidates = (await db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .collect()) as Doc<"users">[];
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const now = Date.now();
  const scored = await Promise.all(
    candidates.map(async (user) => {
      const subscriptions = await db
        .query("subscriptions")
        .withIndex("by_userId_updatedAt", (q) => q.eq("userId", user._id))
        .collect();
      const entitled = subscriptions.some((row) =>
        isSubscriptionEntitled(row.status, row.currentPeriodEndsAt, now),
      );
      return {
        user,
        entitled,
        subscriptionCount: subscriptions.length,
      };
    }),
  );

  scored.sort((a, b) => {
    if (a.entitled !== b.entitled) return a.entitled ? -1 : 1;
    if (a.subscriptionCount !== b.subscriptionCount) {
      return b.subscriptionCount - a.subscriptionCount;
    }
    if (Boolean(a.user.paddleCustomerId) !== Boolean(b.user.paddleCustomerId)) {
      return a.user.paddleCustomerId ? -1 : 1;
    }
    return a.user.createdAt - b.user.createdAt;
  });

  return scored[0]?.user ?? null;
}

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

async function resolveSubscriptionTier(
  db: BillingReadDb,
  subscription: { tier?: string; tierSourcePriceId?: string; priceId?: string } | null | undefined,
): Promise<StoredBillingTier | "free"> {
  if (!subscription) return "free";
  if (
    isStoredBillingTier(subscription.tier) &&
    (!subscription.tierSourcePriceId || subscription.tierSourcePriceId === subscription.priceId)
  ) {
    return subscription.tier;
  }
  return (await resolveBillingTierByPriceId(db, subscription.priceId)) ?? "free";
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

export const syncCurrentUser = mutationGeneric({
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const now = Date.now();

    const email = sanitizeEmail(typeof identity.email === "string" ? identity.email : undefined);
    const name = typeof identity.name === "string" ? identity.name : undefined;
    const imageUrl = getIdentityImageUrl(identity);

    const existingByExternalId = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();
    const existing = existingByExternalId ?? (await findCanonicalUserByEmail(ctx.db, email));

    if (existing) {
      await ctx.db.patch(existing._id, {
        externalId: identity.subject,
        email,
        name,
        imageUrl,
        updatedAt: now,
        lastSeenAt: now,
      });
      await replayIgnoredBillingEvents(ctx, {
        externalId: identity.subject,
        customerId: existing.paddleCustomerId,
      });
      return {
        userId: existing._id,
        externalId: identity.subject,
        paddleCustomerId: existing.paddleCustomerId ?? null,
      };
    }

    const userId = await ctx.db.insert("users", {
      externalId: identity.subject,
      email,
      name,
      imageUrl,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
    await replayIgnoredBillingEvents(ctx, {
      externalId: identity.subject,
    });
    return {
      userId,
      externalId: identity.subject,
      paddleCustomerId: null,
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
    const existing = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();
    if (!existing) {
      throw new ConvexError("User not found. Run syncCurrentUser first.");
    }
    const now = Date.now();
    await setUserPaddleCustomerId(ctx.db, existing, customerId, now, {
      touchLastSeen: true,
    });
    await replayIgnoredBillingEvents(ctx, {
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

    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();

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
    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();

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
    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();

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
    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();

    if (!user) {
      throw new ConvexError("User not found. Run syncCurrentUser first.");
    }

    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_userId_updatedAt", (q) => q.eq("userId", user._id))
      .collect();

    for (const row of subscriptions) {
      await ctx.db.delete(row._id);
    }

    await ctx.db.patch(user._id, {
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
    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();
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

export const getMyBilling = queryGeneric({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        isAuthenticated: false,
        hasUserRecord: false,
        plan: "free",
        isActive: false,
        hasPremiumVoice: false,
        trialActive: false,
        trialEndsAt: null as number | null,
        premiumVoiceSource: "none" as "none" | "trial" | "pro_preview" | "pro_plus",
        proPreviewQuotaChars: null as number | null,
        proPreviewUsedChars: null as number | null,
        proPreviewRemainingChars: null as number | null,
        subscriptionStatus: null as string | null,
        paddleCustomerId: null as string | null,
        paddleSubscriptionId: null as string | null,
        paddleSubscriptionIds: [] as string[],
        blockingSubscriptionIds: [] as string[],
        paddlePriceId: null as string | null,
      };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();
    if (!user) {
      return {
        isAuthenticated: true,
        hasUserRecord: false,
        plan: "free",
        isActive: false,
        hasPremiumVoice: false,
        trialActive: false,
        trialEndsAt: null as number | null,
        premiumVoiceSource: "none" as "none" | "trial" | "pro_preview" | "pro_plus",
        proPreviewQuotaChars: null as number | null,
        proPreviewUsedChars: null as number | null,
        proPreviewRemainingChars: null as number | null,
        subscriptionStatus: null as string | null,
        paddleCustomerId: null as string | null,
        paddleSubscriptionId: null as string | null,
        paddleSubscriptionIds: [] as string[],
        blockingSubscriptionIds: [] as string[],
        paddlePriceId: null as string | null,
      };
    }

    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_userId_updatedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    const now = Date.now();
    const subscription = pickEffectiveSubscription(subscriptions, now);
    const effectivePaddleCustomerId = pickCanonicalPaddleCustomerId(
      user.paddleCustomerId,
      subscription,
      subscriptions,
    );
    const paddleSubscriptionIds = Array.from(
      new Set(
        subscriptions
          .filter((row) => {
            if (!row.paddleSubscriptionId) return false;
            if (!effectivePaddleCustomerId) return false;
            return row.paddleCustomerId === effectivePaddleCustomerId;
          })
          .map((row) => row.paddleSubscriptionId),
      ),
    );
    const blockingSubscriptionIds = Array.from(
      new Set(
        subscriptions
          .filter((row) => {
            if (!row.paddleSubscriptionId) return false;
            if (
              !subscriptionRequiresBillingManagement(
                row.status,
                row.currentPeriodEndsAt,
                now,
              )
            ) {
              return false;
            }
            if (!effectivePaddleCustomerId) return false;
            return row.paddleCustomerId === effectivePaddleCustomerId;
          })
          .map((row) => row.paddleSubscriptionId),
      ),
    );

    const status = subscription?.status ?? null;
    const isActive = isSubscriptionEntitled(
      status,
      subscription?.currentPeriodEndsAt,
      now,
    );
    const tier = isActive ? await resolveSubscriptionTier(ctx.db, subscription) : "free";
    const trialActive = status === "trialing" && isActive;
    const trialEndsAt =
      trialActive && subscription
        ? (subscription.currentPeriodEndsAt ?? subscription.nextBilledAt ?? null)
        : null;
    const hasPremiumVoice = isActive
      ? tier === "pro_plus"
      : false;
    const premiumVoiceSource = trialActive
      ? "trial"
      : isActive
        ? tier === "pro_plus"
          ? "pro_plus"
          : "pro_preview"
        : "none";

    let proPreviewQuotaChars: number | null = null;
    let proPreviewUsedChars: number | null = null;
    let proPreviewRemainingChars: number | null = null;

    if (isActive && tier === "pro") {
      const quota = resolveProPreviewQuotaChars();
      const monthKey = getCurrentMonthKey(now);
      const rowsForUser = await ctx.db
        .query("featureUsageMonthly")
        .withIndex("by_user_month", (q) => q.eq("userId", user._id))
        .collect();
      const existing =
        rowsForUser.find(
          (row) => row.feature === PREMIUM_TTS_FEATURE && row.monthKey === monthKey,
        ) ?? null;
      const used = existing?.usedUnits ?? 0;
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
      premiumVoiceSource,
      proPreviewQuotaChars,
      proPreviewUsedChars,
      proPreviewRemainingChars,
      subscriptionStatus: status,
      paddleCustomerId: effectivePaddleCustomerId,
      paddleSubscriptionId: subscription?.paddleSubscriptionId ?? null,
      paddleSubscriptionIds,
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
        const priceId = await resolveCheckoutPlanPriceId(ctx.db, config.plan);
        return {
          plan: config.plan,
          tier: config.tier,
          interval: config.interval,
          trialEligible: config.trialEligible && trialDays > 0,
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
  },
  handler: async (ctx, { plan }: { plan: "pro_monthly" }) => {
    const priceId = await resolveCheckoutPlanPriceId(ctx.db, plan);
    return {
      plan,
      priceId,
      checkoutEnabled: Boolean(priceId),
    };
  },
});

function buildWebhookArgsFromBillingEvent(event: Doc<"billingEvents">): PaddleWebhookArgs {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt: typeof event.occurredAt === "number" ? new Date(event.occurredAt).toISOString() : undefined,
    subscriptionId: event.paddleSubscriptionId,
    customerId: event.paddleCustomerId,
    externalId: event.externalId,
    subscriptionUpdatedAt: event.subscriptionUpdatedAt,
    subscriptionStatus: event.subscriptionStatus,
    priceId: event.priceId,
    productId: event.productId,
    currentPeriodStartsAt: event.currentPeriodStartsAt,
    currentPeriodEndsAt: event.currentPeriodEndsAt,
    nextBilledAt: event.nextBilledAt,
    canceledAt: event.canceledAt,
    rawBody: event.rawBody,
  };
}

async function applyPaddleWebhookEvent(
  ctx: { db: BillingWriteDb },
  args: PaddleWebhookArgs,
  existingEvent: Doc<"billingEvents"> | null = null,
) {
  const retryIgnoredMissingUser = existingEvent?.status === "ignored_missing_user";
  if (existingEvent && !retryIgnoredMissingUser) {
    return { duplicate: true, eventId: args.eventId };
  }

  const now = Date.now();
  const occurredAt = toMillis(args.occurredAt);
  const subscriptionUpdatedAt = toMillis(args.subscriptionUpdatedAt);
  const incomingEventTime = occurredAt ?? now;
  const incomingVersionTime = subscriptionUpdatedAt ?? incomingEventTime;

  let userId: Id<"users"> | undefined;
  const subscriptionId = args.subscriptionId;
  const existingSubscription = args.subscriptionId
    ? await ctx.db
        .query("subscriptions")
        .withIndex("by_paddleSubscriptionId", (q) =>
          q.eq("paddleSubscriptionId", args.subscriptionId!),
        )
        .first()
    : null;

  const existingSubscriptionOwner = existingSubscription
    ? await ctx.db.get(existingSubscription.userId)
    : null;

  let user = existingSubscriptionOwner;

  if (!user && args.externalId) {
    user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId!))
      .first();
  }

  if (!user && args.customerId) {
    user = await findUniqueUserByPaddleCustomerId(ctx.db, args.customerId);
  }

  let processingStatus: "processed" | "ignored_missing_user" | "ignored_stale_event" = user
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

  if (processingStatus === "processed" && user) {
    userId = user._id;
    if (args.customerId) {
      await setUserPaddleCustomerId(ctx.db, user, args.customerId, now);
    } else {
      await ctx.db.patch(user._id, {
        updatedAt: now,
      });
    }
  }

  if (processingStatus === "processed" && user && args.subscriptionId) {
    const normalizedStatus = normalizeSubscriptionStatus(
      args.eventType,
      args.subscriptionStatus,
    );

    const patch: {
      status: string;
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
      updatedAt: now,
      lastEventType: args.eventType,
      lastEventOccurredAt: incomingEventTime,
    };
    const resolvedTier = args.priceId
      ? await resolveBillingTierByPriceId(ctx.db, args.priceId)
      : isStoredBillingTier(existingSubscription?.tier)
        ? existingSubscription.tier
        : undefined;
    if (resolvedTier) {
      patch.tier = resolvedTier;
      patch.tierSourcePriceId = args.priceId;
    } else if (
      args.priceId &&
      existingSubscription?.priceId &&
      existingSubscription.priceId !== args.priceId
    ) {
      patch.tier = undefined;
      patch.tierSourcePriceId = undefined;
    }
    if (subscriptionUpdatedAt !== undefined) {
      patch.lastSubscriptionUpdatedAt = subscriptionUpdatedAt;
    }

    if (args.customerId) patch.paddleCustomerId = args.customerId;
    if (args.priceId) patch.priceId = args.priceId;
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
        ...(resolvedTier
          ? {
              tier: resolvedTier,
              tierSourcePriceId: args.priceId,
            }
          : {}),
        priceId: args.priceId,
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
    paddleSubscriptionId: subscriptionId,
    paddleCustomerId: args.customerId,
    subscriptionUpdatedAt: args.subscriptionUpdatedAt,
    subscriptionStatus: args.subscriptionStatus,
    priceId: args.priceId,
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
  filters: { externalId?: string; customerId?: string },
) {
  const rows: Doc<"billingEvents">[] = [];

  if (filters.externalId) {
    const byExternalId = await ctx.db
      .query("billingEvents")
      .withIndex("by_status_externalId", (q) =>
        q.eq("status", "ignored_missing_user").eq("externalId", filters.externalId!),
      )
      .collect();
    rows.push(...byExternalId);
  }

  if (filters.customerId) {
    const byCustomerId = await ctx.db
      .query("billingEvents")
      .withIndex("by_status_customerId", (q) =>
        q.eq("status", "ignored_missing_user").eq("paddleCustomerId", filters.customerId!),
      )
      .collect();
    rows.push(...byCustomerId);
  }

  const uniqueRows = Array.from(new Map(rows.map((row) => [row._id, row])).values()).sort((a, b) => {
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
    subscriptionUpdatedAt: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    priceId: v.optional(v.string()),
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
