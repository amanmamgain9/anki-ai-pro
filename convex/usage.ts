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

const PREMIUM_TTS_PREVIEW_FEATURE = "premium_tts";
const PREMIUM_TTS_UNLIMITED_FEATURE = "premium_tts_unlimited";
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
    email: typeof identity.email === "string" ? identity.email : undefined,
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

async function getFeatureUsageRows(
  db: UsageReadDb,
  userId: DataModel["users"]["document"]["_id"],
  feature: string,
  monthKey: string,
) {
  return await db
    .query("featureUsageMonthly")
    .withIndex("by_user_feature_month", (q) =>
      q.eq("userId", userId).eq("feature", feature).eq("monthKey", monthKey),
    )
    .collect();
}

function splitFeatureUsageRows<
  T extends { _id: string; usedUnits: number; updatedAt: number; createdAt: number },
>(rows: T[]) {
  const ordered = [...rows].sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return b.createdAt - a.createdAt;
  });
  const [primary, ...duplicates] = ordered;
  return {
    primary: primary ?? null,
    duplicates,
    usedUnits: ordered.reduce((sum, row) => sum + row.usedUnits, 0),
  };
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
    const previewRows = await getFeatureUsageRows(
      ctx.db,
      user._id,
      PREMIUM_TTS_PREVIEW_FEATURE,
      monthKey,
    );
    const unlimitedRows = await getFeatureUsageRows(
      ctx.db,
      user._id,
      PREMIUM_TTS_UNLIMITED_FEATURE,
      monthKey,
    );
    const previewUsage = splitFeatureUsageRows(previewRows);
    const unlimitedUsage = splitFeatureUsageRows(unlimitedRows);

    if (paidAccess.hasPremiumVoice) {
      if (unlimitedUsage.primary) {
        await ctx.db.patch(unlimitedUsage.primary._id, {
          usedUnits: unlimitedUsage.usedUnits + normalizedUnits,
          updatedAt: now,
        });
        for (const duplicate of unlimitedUsage.duplicates) {
          await ctx.db.delete(duplicate._id as never);
        }
      } else {
        await ctx.db.insert("featureUsageMonthly", {
          userId: user._id,
          feature: PREMIUM_TTS_UNLIMITED_FEATURE,
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
        feature: PREMIUM_TTS_UNLIMITED_FEATURE,
        source: "subscription",
      } as const;
    }

    const quota = resolveProPreviewQuotaChars();
    const used = previewUsage.usedUnits;
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

    if (previewUsage.primary) {
      await ctx.db.patch(previewUsage.primary._id, {
        usedUnits: nextUsed,
        quotaUnits: quota,
        updatedAt: now,
      });
      for (const duplicate of previewUsage.duplicates) {
        await ctx.db.delete(duplicate._id as never);
      }
    } else {
      await ctx.db.insert("featureUsageMonthly", {
        userId: user._id,
        feature: PREMIUM_TTS_PREVIEW_FEATURE,
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
      feature: PREMIUM_TTS_PREVIEW_FEATURE,
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
    feature: v.union(
      v.literal(PREMIUM_TTS_PREVIEW_FEATURE),
      v.literal(PREMIUM_TTS_UNLIMITED_FEATURE),
    ),
    proofIssuedAt: v.number(),
    refundSignature: v.string(),
  },
  handler: async (ctx, { units, monthKey, feature, proofIssuedAt, refundSignature }) => {
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
      `${user._id}:${feature}:${monthKey}:${normalizedUnits}:${proofIssuedAt}`,
    );
    if (refundSignature !== expectedSignature) {
      throw new ConvexError("Invalid refund authorization");
    }

    const usageRows = await getFeatureUsageRows(ctx.db, user._id, feature, monthKey);
    const usage = splitFeatureUsageRows(usageRows);

    if (!usage.primary) {
      return {
        refunded: false,
        monthKey,
        used: 0,
      } as const;
    }

    const nextUsed = Math.max(0, usage.usedUnits - normalizedUnits);
    await ctx.db.patch(usage.primary._id, {
      usedUnits: nextUsed,
      updatedAt: now,
    });
    for (const duplicate of usage.duplicates) {
      await ctx.db.delete(duplicate._id as never);
    }

    return {
      refunded: true,
      monthKey,
      used: nextUsed,
    } as const;
  },
});
