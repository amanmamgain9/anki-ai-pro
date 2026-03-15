import type { UserIdentity } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutationGeneric, queryGeneric } from "convex/server";
import type { Id } from "./_generated/dataModel";
import {
  listBillingPlanConfigs,
  resolveBillingTierByPriceId,
  resolveCheckoutPlanPriceId,
  type BillingPlan,
} from "./billingPlans";
import { isSubscriptionEntitled, pickEffectiveSubscription } from "./subscriptionAccess";

type AuthCtx = {
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>;
  };
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

const DAY_MS = 86_400_000;
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

export const syncCurrentUser = mutationGeneric({
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const now = Date.now();
    const trialDays = resolveFreeProPlusTrialDays();
    const defaultTrialEndsAt = trialDays > 0 ? now + trialDays * DAY_MS : undefined;

    const email = typeof identity.email === "string" ? identity.email : undefined;
    const name = typeof identity.name === "string" ? identity.name : undefined;
    const imageUrl = getIdentityImageUrl(identity);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();

    if (existing) {
      const fallbackTrialEndsAt =
        trialDays > 0 && existing.trialEndsAt === undefined
          ? existing.createdAt + trialDays * DAY_MS
          : undefined;
      await ctx.db.patch(existing._id, {
        email,
        name,
        imageUrl,
        ...(fallbackTrialEndsAt !== undefined
          ? { trialEndsAt: fallbackTrialEndsAt }
          : {}),
        updatedAt: now,
        lastSeenAt: now,
      });
      return {
        userId: existing._id,
        externalId: existing.externalId,
        paddleCustomerId: existing.paddleCustomerId ?? null,
      };
    }

    const userId = await ctx.db.insert("users", {
      externalId: identity.subject,
      email,
      name,
      imageUrl,
      ...(defaultTrialEndsAt !== undefined ? { trialEndsAt: defaultTrialEndsAt } : {}),
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
    return {
      userId,
      externalId: identity.subject,
      paddleCustomerId: null,
    };
  },
});

export const supportSetTrialEndsAtAndClearSubscriptions = mutationGeneric({
  args: {
    externalId: v.string(),
    trialEndsAt: v.number(),
    clearSubscriptions: v.optional(v.boolean()),
  },
  handler: async (ctx, { externalId, trialEndsAt, clearSubscriptions }) => {
    const identity = await requireIdentity(ctx);
    const callerEmail = (identity.email ?? "").toLowerCase();
    if (!SUPPORT_OPERATOR_EMAILS.has(callerEmail)) {
      throw new ConvexError("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
      .first();
    if (!user) {
      throw new ConvexError("User not found");
    }

    const now = Date.now();
    await ctx.db.patch(user._id, {
      trialEndsAt,
      updatedAt: now,
      lastSeenAt: now,
    });

    let deletedSubscriptions = 0;
    if (clearSubscriptions) {
      const subscriptions = await ctx.db
        .query("subscriptions")
        .withIndex("by_userId_updatedAt", (q) => q.eq("userId", user._id))
        .collect();
      for (const row of subscriptions) {
        await ctx.db.delete(row._id);
        deletedSubscriptions += 1;
      }
    }

    return {
      userId: user._id,
      externalId: user.externalId,
      trialEndsAt,
      deletedSubscriptions,
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
    await ctx.db.patch(existing._id, {
      paddleCustomerId: customerId,
      updatedAt: Date.now(),
      lastSeenAt: Date.now(),
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

export const setMyCreatedAtForTesting = mutationGeneric({
  args: {
    testSecret: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, { testSecret, createdAt }) => {
    ensureTestingAllowed(testSecret);
    const identity = await requireIdentity(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();

    if (!user) {
      throw new ConvexError("User not found. Run syncCurrentUser first.");
    }

    const now = Date.now();
    await ctx.db.patch(user._id, {
      createdAt,
      updatedAt: now,
      lastSeenAt: now,
    });
    return { userId: user._id, createdAt };
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

    const status = subscription?.status ?? null;
    const isActive = isSubscriptionEntitled(
      status,
      subscription?.currentPeriodEndsAt,
      now,
    );
    const tier = isActive
      ? await resolveBillingTierByPriceId(ctx.db, subscription?.priceId)
      : "free";
    const trialDays = resolveFreeProPlusTrialDays();
    const fallbackTrialEndsAt = trialDays > 0 ? user.createdAt + trialDays * DAY_MS : null;
    const trialEndsAt = user.trialEndsAt ?? fallbackTrialEndsAt;
    const trialActive =
      !isActive && trialEndsAt !== null && now < trialEndsAt;
    const hasPremiumVoice = isActive
      ? tier === "pro_plus"
      : trialActive;
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
      trialEndsAt: trialActive ? trialEndsAt : null,
      premiumVoiceSource,
      proPreviewQuotaChars,
      proPreviewUsedChars,
      proPreviewRemainingChars,
      subscriptionStatus: status,
      paddleCustomerId: user.paddleCustomerId ?? null,
      paddleSubscriptionId: subscription?.paddleSubscriptionId ?? null,
      paddlePriceId: subscription?.priceId ?? null,
    };
  },
});

export const getBillingPlansPublic = queryGeneric({
  handler: async (ctx) => {
    const trialDays = resolveFreeProPlusTrialDays();
    const plans = await Promise.all(
      listBillingPlanConfigs().map(async (config) => {
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
    plan: v.union(v.literal("pro_monthly"), v.literal("pro_plus_monthly")),
  },
  handler: async (ctx, { plan }: { plan: BillingPlan }) => {
    const priceId = await resolveCheckoutPlanPriceId(ctx.db, plan);
    return {
      plan,
      priceId,
      checkoutEnabled: Boolean(priceId),
    };
  },
});

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
    if (existingEvent) {
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

    let user = args.customerId
      ? await ctx.db
          .query("users")
          .withIndex("by_paddleCustomerId", (q) =>
            q.eq("paddleCustomerId", args.customerId),
          )
          .first()
      : null;

    if (!user && args.externalId) {
      user = await ctx.db
        .query("users")
        .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId!))
        .first();
    }

    if (!user && existingSubscription) {
      user = await ctx.db.get(existingSubscription.userId);
    }
    if (user && existingSubscription && existingSubscription.userId !== user._id) {
      const subscriptionOwner = await ctx.db.get(existingSubscription.userId);
      if (subscriptionOwner) {
        user = subscriptionOwner;
      }
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
      const userPatch: {
        updatedAt: number;
        paddleCustomerId?: string;
      } = {
        updatedAt: now,
      };
      if (args.customerId && user.paddleCustomerId !== args.customerId) {
        userPatch.paddleCustomerId = args.customerId;
      }
      await ctx.db.patch(user._id, userPatch);
    }

    if (processingStatus === "processed" && user && args.subscriptionId) {

      const normalizedStatus = normalizeSubscriptionStatus(
        args.eventType,
        args.subscriptionStatus,
      );

      const patch: {
        status: string;
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

    await ctx.db.insert("billingEvents", {
      eventId: args.eventId,
      eventType: args.eventType,
      occurredAt,
      processedAt: now,
      status: processingStatus,
      userId,
      paddleSubscriptionId: subscriptionId,
      paddleCustomerId: args.customerId,
      rawBody: args.rawBody,
    });

    return {
      duplicate: false,
      eventId: args.eventId,
      userResolved: Boolean(userId),
      stale: processingStatus === "ignored_stale_event",
      subscriptionId: subscriptionId ?? null,
    };
  },
});
