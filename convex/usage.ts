import type { UserIdentity } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutationGeneric, type GenericDatabaseReader } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { findCanonicalUserByIdentity } from "./billingIdentity";
import { isRecognizedSubscription, resolvePaidPlanAccess } from "./paidPlanAccess";
import { pickEffectiveSubscription } from "./subscriptionAccess";

type AuthCtx = {
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>;
  };
};

type BillingTier = "inactive" | "pro" | "pro_plus";
type UsageReadDb = GenericDatabaseReader<DataModel>;

const PREMIUM_TTS_FEATURE = "premium_tts";
const REFUND_PROOF_TTL_MS = 10 * 60 * 1000;

function getIdentityClaim(identity: UserIdentity, key: string): string | undefined {
  const value = (identity as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function findUserForIdentity(db: UsageReadDb, identity: UserIdentity) {
  return await findCanonicalUserByIdentity(db, {
    externalId: identity.subject,
    provider: getIdentityClaim(identity, "provider"),
    providerSubject: getIdentityClaim(identity, "providerSubject"),
  });
}

function getCurrentMonthKey(now: number) {
  const d = new Date(now);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function resolveProPreviewQuotaChars() {
  const raw = process.env.PRO_PREMIUM_TTS_PREVIEW_CHARS ?? "60000";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 60000;
  return Math.max(0, Math.floor(parsed));
}

async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Unauthorized");
  }
  return identity;
}

function getTtsRefundProofSecret() {
  const secret = process.env.PADDLE_WEBHOOK_FORWARD_SECRET;
  if (!secret) {
    throw new ConvexError("Missing PADDLE_WEBHOOK_FORWARD_SECRET");
  }
  return secret;
}

async function signRefundProof(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getTtsRefundProofSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const consumePremiumTtsPreview = mutationGeneric({
  args: {
    units: v.number(),
  },
  handler: async (ctx, { units }) => {
    const normalizedUnits = Math.max(1, Math.floor(units));
    const now = Date.now();
    const identity = await requireIdentity(ctx);

    const user = await findUserForIdentity(ctx.db, identity);
    if (!user) {
      throw new ConvexError("User not found. Run syncCurrentUser first.");
    }

    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_userId_updatedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
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
    const paidAccess = await resolvePaidPlanAccess(
      ctx.db,
      subscription,
      user,
      now,
    );
    if (!paidAccess.isActive) {
      return {
        allowed: false,
        reason: "inactive_plan",
      } as const;
    }

    const tier = paidAccess.tier as BillingTier;
    const trialEndsAt = paidAccess.trialEndsAt;

    if (paidAccess.premiumVoiceSource === "trial") {
      return {
        allowed: true,
        tier,
        unlimited: true,
        source: "trial",
        trialEndsAt: trialEndsAt ?? undefined,
      } as const;
    }

    const monthKey = getCurrentMonthKey(now);
    const rowsForUser = await ctx.db
      .query("featureUsageMonthly")
      .withIndex("by_user_month", (q) => q.eq("userId", user._id))
      .collect();
    const existing =
      rowsForUser.find(
        (row) => row.feature === PREMIUM_TTS_FEATURE && row.monthKey === monthKey,
      ) ?? null;

    if (paidAccess.hasPremiumVoice) {
      if (existing) {
        await ctx.db.patch(existing._id, {
          usedUnits: existing.usedUnits + normalizedUnits,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("featureUsageMonthly", {
          userId: user._id,
          feature: PREMIUM_TTS_FEATURE,
          monthKey,
          usedUnits: normalizedUnits,
          createdAt: now,
          updatedAt: now,
        });
      }
      return {
        allowed: true,
        tier,
        unlimited: true,
        monthKey,
        source: "subscription",
      } as const;
    }

    const quota = resolveProPreviewQuotaChars();
    const used = existing?.usedUnits ?? 0;
    const nextUsed = used + normalizedUnits;
    if (nextUsed > quota) {
      return {
        allowed: false,
        tier,
        unlimited: false,
        quota,
        used,
        remaining: Math.max(0, quota - used),
        reason: "preview_exhausted",
      } as const;
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        usedUnits: nextUsed,
        quotaUnits: quota,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("featureUsageMonthly", {
        userId: user._id,
        feature: PREMIUM_TTS_FEATURE,
        monthKey,
        usedUnits: nextUsed,
        quotaUnits: quota,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      allowed: true,
      tier,
      unlimited: false,
      monthKey,
      quota,
      used: nextUsed,
      remaining: Math.max(0, quota - nextUsed),
    } as const;
  },
});

export const refundPremiumTtsPreview = mutationGeneric({
  args: {
    units: v.number(),
    monthKey: v.string(),
    proofIssuedAt: v.number(),
    refundSignature: v.string(),
  },
  handler: async (ctx, { units, monthKey, proofIssuedAt, refundSignature }) => {
    const normalizedUnits = Math.max(1, Math.floor(units));
    const now = Date.now();
    const identity = await requireIdentity(ctx);

    const user = await findUserForIdentity(ctx.db, identity);
    if (!user) {
      throw new ConvexError("User not found. Run syncCurrentUser first.");
    }
    if (!Number.isFinite(proofIssuedAt) || proofIssuedAt > now) {
      throw new ConvexError("Invalid refund authorization");
    }
    if (now - proofIssuedAt > REFUND_PROOF_TTL_MS) {
      throw new ConvexError("Expired refund authorization");
    }
    const expectedSignature = await signRefundProof(
      `${user._id}:${monthKey}:${normalizedUnits}:${proofIssuedAt}`,
    );
    if (refundSignature !== expectedSignature) {
      throw new ConvexError("Invalid refund authorization");
    }

    const rowsForUser = await ctx.db
      .query("featureUsageMonthly")
      .withIndex("by_user_month", (q) => q.eq("userId", user._id))
      .collect();
    const existing =
      rowsForUser.find(
        (row) => row.feature === PREMIUM_TTS_FEATURE && row.monthKey === monthKey,
      ) ?? null;

    if (!existing) {
      return {
        refunded: false,
        monthKey,
        used: 0,
      } as const;
    }

    const nextUsed = Math.max(0, existing.usedUnits - normalizedUnits);
    await ctx.db.patch(existing._id, {
      usedUnits: nextUsed,
      updatedAt: now,
    });

    return {
      refunded: true,
      monthKey,
      used: nextUsed,
    } as const;
  },
});
