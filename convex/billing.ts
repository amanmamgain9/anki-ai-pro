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
import { pickEffectiveSubscription, subscriptionRequiresBillingManagement } from "./subscriptionAccess";

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

type BillingEventProcessingStatus =
  | "processed"
  | "ignored_missing_user"
  | "ignored_stale_event"
  | "ignored_unknown_plan";

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

const PREMIUM_TTS_FEATURE = "premium_tts";
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

    const user = await ensureCanonicalAuthUser(ctx.db, {
      provider: getIdentityClaim(identity, "provider"),
      providerSubject: getIdentityClaim(identity, "providerSubject"),
      externalIdHint: identity.subject,
      email: sanitizeEmail(typeof identity.email === "string" ? identity.email : undefined),
      name: typeof identity.name === "string" ? identity.name : undefined,
      imageUrl: getIdentityImageUrl(identity),
      now,
    });
    await replayIgnoredBillingEvents(ctx, {
      externalId: user.externalId,
      customerId: user.paddleCustomerId,
    });
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

    for (const row of subscriptions) {
      await ctx.db.delete(row._id);
    }

    await ctx.db.patch(user._id, {
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
    tier: v.union(v.literal("pro_plus"), v.null()),
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
        blockingSubscriptionIds: [] as string[],
        paddlePriceId: null as string | null,
      };
    }

    const allSubscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_userId_updatedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    const recognizedEntries = await Promise.all(
      allSubscriptions.map(async (row) => ({
        row,
        recognized: await isRecognizedSubscription(ctx.db, row),
      })),
    );
    const subscriptions = recognizedEntries
      .filter((entry) => entry.recognized)
      .map((entry) => entry.row);
    const now = Date.now();
    const subscription = pickEffectiveSubscription(subscriptions, now);
    const effectivePaddleCustomerId = pickCanonicalPaddleCustomerId(
      user.paddleCustomerId,
      subscription,
      subscriptions,
    );
    const recoverableSubscriptions = subscriptions.filter((row) =>
      subscriptionRequiresBillingManagement(
        row.status,
        row.currentPeriodEndsAt,
        row.nextBilledAt,
        now,
      ),
    );
    const recoverableCustomerIds = Array.from(
      new Set(
        recoverableSubscriptions
          .map((row) => row.paddleCustomerId)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      ),
    );
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
            return !row.paddleCustomerId || row.paddleCustomerId === billingManagementCustomerId;
          })
          .map((row) => row.paddleSubscriptionId),
      ),
    );
    const blockingSubscriptionIds = Array.from(
      new Set(
        recoverableSubscriptions
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

    let proPreviewQuotaChars: number | null = null;
    let proPreviewUsedChars: number | null = null;
    let proPreviewRemainingChars: number | null = null;

    if (isActive && tier === "pro" && !hasPremiumVoice) {
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
      accessSource: paidAccess.accessSource,
      subscriptionEntitled: paidAccess.subscriptionEntitled,
      premiumVoiceSource,
      manualAccessTier: user.manualAccessTier ?? null,
      manualAccessEndsAt: user.manualAccessEndsAt ?? null,
      manualAccessReason: user.manualAccessReason ?? null,
      proPreviewQuotaChars,
      proPreviewUsedChars,
      proPreviewRemainingChars,
      subscriptionStatus: status,
      paddleCustomerId: billingManagementCustomerId,
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

export const adminSetManualAccess = mutationGeneric({
  args: {
    email: v.string(),
    tier: v.union(v.literal("pro_plus"), v.null()),
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
      await ctx.db.patch(user._id, {
        manualAccessTier: undefined,
        manualAccessEndsAt: undefined,
        manualAccessReason: undefined,
        manualAccessGrantedBy: undefined,
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
    const expectedPriceId = await resolveCheckoutPlanPriceId(ctx.db, plan);
    if (!expectedPriceId) {
      throw new ConvexError(`Checkout is not configured for ${plan}`);
    }
    if (priceId !== expectedPriceId) {
      throw new ConvexError("Checkout price does not match the configured plan");
    }
    const allSubscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_userId_updatedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    const recognizedEntries = await Promise.all(
      allSubscriptions.map(async (row) => ({
        row,
        recognized: await isRecognizedSubscription(ctx.db, row),
      })),
    );
    const subscriptions = recognizedEntries
      .filter((entry) => entry.recognized)
      .map((entry) => entry.row);
    const now = Date.now();
    const currentAccess = await resolvePaidPlanAccess(
      ctx.db,
      pickEffectiveSubscription(subscriptions, now),
      user,
      now,
    );
    if (currentAccess.isActive) {
      throw new ConvexError("Active access already exists");
    }
    const recoverableSubscriptions = subscriptions.filter((row) =>
      subscriptionRequiresBillingManagement(
        row.status,
        row.currentPeriodEndsAt,
        row.nextBilledAt,
        now,
      ),
    );
    if (recoverableSubscriptions.length > 0) {
      throw new ConvexError("Subscription requires billing management");
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

async function resolveWebhookBillingPriceId(
  db: BillingReadDb,
  args: Pick<PaddleWebhookArgs, "priceId" | "priceIds">,
) {
  const candidates = Array.from(
    new Set(
      [args.priceId, ...(args.priceIds ?? [])].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    ),
  );
  for (const candidate of candidates) {
    if (await resolveBillingTierByPriceId(db, candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

async function applyPaddleWebhookEvent(
  ctx: { db: BillingWriteDb },
  args: PaddleWebhookArgs,
  existingEvent: Doc<"billingEvents"> | null = null,
) {
  const retryableIgnoredEvent =
    existingEvent?.status === "ignored_missing_user" ||
    existingEvent?.status === "ignored_unknown_plan";
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
  const webhookUserResolution = pickWebhookUserResolution([
    {
      user: checkoutSessionUser,
      source: "checkout_session",
      priority: 4,
    },
    {
      user: externalIdUser,
      source: "external_id",
      priority: 3,
    },
    {
      user: customerIdUser,
      source: "customer_id",
      priority: 2,
    },
    {
      user: existingSubscriptionOwner,
      source: "existing_subscription",
      priority: 1,
    },
  ]);

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

  const resolvedPriceId =
    processingStatus === "processed" && args.subscriptionId
      ? await resolveWebhookBillingPriceId(ctx.db, args)
      : undefined;
  const existingTier = isStoredBillingTier(existingSubscription?.tier)
    ? existingSubscription.tier
    : undefined;
  const checkoutSessionTier = resolveBillingTierByPlan(checkoutSession?.plan);
  const resolvedTier =
    resolvedPriceId && processingStatus === "processed"
      ? await resolveBillingTierByPriceId(ctx.db, resolvedPriceId)
      : existingTier ?? checkoutSessionTier ?? undefined;
  const managesRecognizedPlan = Boolean(resolvedTier || existingTier || checkoutSessionTier);
  if (
    processingStatus === "processed" &&
    args.subscriptionId &&
    !managesRecognizedPlan
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
  }

  if (processingStatus === "processed" && checkoutSession) {
    await ctx.db.patch(checkoutSession._id, {
      updatedAt: now,
      paddleCustomerId: args.customerId ?? checkoutSession.paddleCustomerId,
      paddleSubscriptionId: args.subscriptionId ?? checkoutSession.paddleSubscriptionId,
      completedAt: args.subscriptionId ? now : checkoutSession.completedAt,
    });
  }

  if (processingStatus === "processed" && user && args.subscriptionId) {
    const normalizedStatus = normalizeSubscriptionStatus(
      args.eventType,
      args.subscriptionStatus,
    );

    const patch: {
      userId?: Id<"users">;
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
    if (resolvedTier) {
      patch.tier = resolvedTier;
      patch.tierSourcePriceId = resolvedPriceId ?? checkoutSession?.priceId;
    } else if (isStoredBillingTier(existingSubscription?.tier)) {
      patch.tier = existingSubscription.tier;
      patch.tierSourcePriceId =
        existingSubscription.tierSourcePriceId ?? existingSubscription.priceId;
    } else if (checkoutSessionTier) {
      patch.tier = checkoutSessionTier;
      patch.tierSourcePriceId = checkoutSession?.priceId;
    }
    if (subscriptionUpdatedAt !== undefined) {
      patch.lastSubscriptionUpdatedAt = subscriptionUpdatedAt;
    }
    if (existingSubscription && existingSubscription.userId !== user._id) {
      patch.userId = user._id;
    }

    if (args.customerId) patch.paddleCustomerId = args.customerId;
    if (resolvedPriceId) patch.priceId = resolvedPriceId;
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
              tierSourcePriceId: resolvedPriceId ?? checkoutSession?.priceId,
            }
          : checkoutSessionTier
            ? {
                tier: checkoutSessionTier,
                tierSourcePriceId: checkoutSession?.priceId,
              }
            : {}),
        priceId: resolvedPriceId,
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
  filters: { externalId?: string; customerId?: string },
) {
  const rows: Doc<"billingEvents">[] = [];
  const statusesToReplay: Array<"ignored_missing_user" | "ignored_unknown_plan"> = [
    "ignored_missing_user",
    "ignored_unknown_plan",
  ];

  if (filters.externalId) {
    for (const status of statusesToReplay) {
      const byExternalId = await ctx.db
        .query("billingEvents")
        .withIndex("by_status_externalId", (q) =>
          q.eq("status", status).eq("externalId", filters.externalId!),
        )
        .collect();
      rows.push(...byExternalId);
    }
  }

  if (filters.customerId) {
    for (const status of statusesToReplay) {
      const byCustomerId = await ctx.db
        .query("billingEvents")
        .withIndex("by_status_customerId", (q) =>
          q.eq("status", status).eq("paddleCustomerId", filters.customerId!),
        )
        .collect();
      rows.push(...byCustomerId);
    }
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
