import type { UserIdentity } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutationGeneric, queryGeneric } from "convex/server";
import type { Id } from "./_generated/dataModel";

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

function toMillis(value: string | undefined): number | undefined {
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

export const syncCurrentUser = mutationGeneric({
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const now = Date.now();

    const email = typeof identity.email === "string" ? identity.email : undefined;
    const name = typeof identity.name === "string" ? identity.name : undefined;
    const imageUrl = getIdentityImageUrl(identity);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email,
        name,
        imageUrl,
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

export const setMyPaddleCustomerId = mutationGeneric({
  args: {
    customerId: v.string(),
  },
  handler: async (ctx, { customerId }) => {
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

export const getMyBilling = queryGeneric({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        isAuthenticated: false,
        hasUserRecord: false,
        plan: "free",
        isActive: false,
        subscriptionStatus: null as string | null,
        paddleCustomerId: null as string | null,
        paddleSubscriptionId: null as string | null,
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
        subscriptionStatus: null as string | null,
        paddleCustomerId: null as string | null,
        paddleSubscriptionId: null as string | null,
      };
    }

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_userId_updatedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();

    const status = subscription?.status ?? null;
    const isActive = status === "active" || status === "trialing";

    return {
      isAuthenticated: true,
      hasUserRecord: true,
      plan: isActive ? "pro" : "free",
      isActive,
      subscriptionStatus: status,
      paddleCustomerId: user.paddleCustomerId ?? null,
      paddleSubscriptionId: subscription?.paddleSubscriptionId ?? null,
    };
  },
});

export const processPaddleWebhook = mutationGeneric({
  args: {
    forwardSecret: v.string(),
    eventId: v.string(),
    eventType: v.string(),
    occurredAt: v.optional(v.string()),
    subscriptionId: v.optional(v.string()),
    customerId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    priceId: v.optional(v.string()),
    productId: v.optional(v.string()),
    currentPeriodStartsAt: v.optional(v.string()),
    currentPeriodEndsAt: v.optional(v.string()),
    nextBilledAt: v.optional(v.string()),
    canceledAt: v.optional(v.string()),
    rawBody: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.PADDLE_WEBHOOK_FORWARD_SECRET;
    if (!expectedSecret || args.forwardSecret !== expectedSecret) {
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

    let userId: Id<"users"> | undefined;
    const subscriptionId = args.subscriptionId;

    const user = args.customerId
      ? await ctx.db
          .query("users")
          .withIndex("by_paddleCustomerId", (q) =>
            q.eq("paddleCustomerId", args.customerId),
          )
          .first()
      : null;

    if (user) {
      userId = user._id;
      await ctx.db.patch(user._id, {
        updatedAt: now,
      });
    }

    if (user && args.subscriptionId) {
      const existingSubscription = await ctx.db
        .query("subscriptions")
        .withIndex("by_paddleSubscriptionId", (q) =>
          q.eq("paddleSubscriptionId", args.subscriptionId!),
        )
        .first();

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
      } = {
        status: normalizedStatus,
        updatedAt: now,
        lastEventType: args.eventType,
      };

      if (args.customerId) patch.paddleCustomerId = args.customerId;
      if (args.priceId) patch.priceId = args.priceId;
      if (args.productId) patch.productId = args.productId;
      const currentPeriodStartsAt = toMillis(args.currentPeriodStartsAt);
      if (currentPeriodStartsAt) patch.currentPeriodStartsAt = currentPeriodStartsAt;
      const currentPeriodEndsAt = toMillis(args.currentPeriodEndsAt);
      if (currentPeriodEndsAt) patch.currentPeriodEndsAt = currentPeriodEndsAt;
      const nextBilledAt = toMillis(args.nextBilledAt);
      if (nextBilledAt) patch.nextBilledAt = nextBilledAt;
      const canceledAt = toMillis(args.canceledAt);
      if (canceledAt) patch.canceledAt = canceledAt;

      if (existingSubscription) {
        await ctx.db.patch(existingSubscription._id, patch);
      } else {
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
        });
      }
    }

    await ctx.db.insert("billingEvents", {
      eventId: args.eventId,
      eventType: args.eventType,
      occurredAt,
      processedAt: now,
      status: user ? "processed" : "ignored_missing_user",
      userId,
      paddleSubscriptionId: subscriptionId,
      paddleCustomerId: args.customerId,
      rawBody: args.rawBody,
    });

    return {
      duplicate: false,
      eventId: args.eventId,
      userResolved: Boolean(user),
      subscriptionId: subscriptionId ?? null,
    };
  },
});
