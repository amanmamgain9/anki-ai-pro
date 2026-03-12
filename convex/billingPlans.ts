/* eslint-disable @typescript-eslint/no-explicit-any */
import type { UserIdentity } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutationGeneric, queryGeneric } from "convex/server";

type BillingPlan = "pro_monthly" | "pro_yearly" | "pro_plus_monthly" | "pro_plus_yearly";
type BillingTier = "pro" | "pro_plus";
type BillingInterval = "monthly" | "yearly";

type AuthCtx = {
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>;
  };
};

const BILLING_PLAN_CONFIGS: Record<
  BillingPlan,
  {
    plan: BillingPlan;
    tier: BillingTier;
    interval: BillingInterval;
    trialEligible: boolean;
    envVars: readonly string[];
    legacyEnvVars?: readonly string[];
  }
> = {
  pro_monthly: {
    plan: "pro_monthly",
    tier: "pro",
    interval: "monthly",
    trialEligible: false,
    envVars: ["PADDLE_PRICE_ID_PRO_MONTHLY"],
    legacyEnvVars: ["PADDLE_PRICE_ID_MONTHLY"],
  },
  pro_yearly: {
    plan: "pro_yearly",
    tier: "pro",
    interval: "yearly",
    trialEligible: false,
    envVars: ["PADDLE_PRICE_ID_PRO_YEARLY"],
    legacyEnvVars: ["PADDLE_PRICE_ID_YEARLY"],
  },
  pro_plus_monthly: {
    plan: "pro_plus_monthly",
    tier: "pro_plus",
    interval: "monthly",
    trialEligible: true,
    envVars: ["PADDLE_PRICE_ID_PRO_PLUS_MONTHLY"],
  },
  pro_plus_yearly: {
    plan: "pro_plus_yearly",
    tier: "pro_plus",
    interval: "yearly",
    trialEligible: true,
    envVars: ["PADDLE_PRICE_ID_PRO_PLUS_YEARLY"],
  },
};

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

function resolvePriceIdFromEnv(plan: BillingPlan) {
  const config = BILLING_PLAN_CONFIGS[plan];
  for (const envVar of config.envVars) {
    const value = process.env[envVar];
    if (value && value.length > 0) return value;
  }
  for (const envVar of config.legacyEnvVars ?? []) {
    const value = process.env[envVar];
    if (value && value.length > 0) return value;
  }
  return null;
}

async function requireSupportOperator(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Unauthorized");
  }
  const email = typeof identity.email === "string" ? identity.email.toLowerCase() : "";
  if (!SUPPORT_OPERATOR_EMAILS.has(email)) {
    throw new ConvexError("Unauthorized");
  }
  return identity;
}

async function getRowByPlan(db: any, plan: BillingPlan) {
  return await db
    .query("billingPlanPrices")
    .withIndex("by_plan", (q: any) => q.eq("plan", plan))
    .first();
}

export async function resolveCheckoutPlanPriceId(db: any, plan: BillingPlan) {
  const row = await getRowByPlan(db, plan);
  if (row?.active && row.paddlePriceId) {
    return row.paddlePriceId;
  }
  return resolvePriceIdFromEnv(plan);
}

export async function resolveBillingTierByPriceId(
  db: any,
  priceId: string | undefined,
): Promise<BillingTier> {
  if (!priceId) return "pro";

  const row = await db
    .query("billingPlanPrices")
    .withIndex("by_priceId", (q: any) => q.eq("paddlePriceId", priceId))
    .first();
  if (row?.active && (row.tier === "pro" || row.tier === "pro_plus")) {
    return row.tier;
  }

  for (const [plan, config] of Object.entries(BILLING_PLAN_CONFIGS) as Array<
    [BillingPlan, (typeof BILLING_PLAN_CONFIGS)[BillingPlan]]
  >) {
    if (resolvePriceIdFromEnv(plan) === priceId) {
      return config.tier;
    }
  }
  return "pro";
}

export const listPublic = queryGeneric({
  handler: async (ctx) => {
    const trialDays = resolveFreeProPlusTrialDays();
    const plans = await Promise.all(
      (Object.keys(BILLING_PLAN_CONFIGS) as BillingPlan[]).map(async (plan) => {
        const config = BILLING_PLAN_CONFIGS[plan];
        const row = await getRowByPlan(ctx.db, plan);
        const priceId =
          row?.active && row.paddlePriceId ? row.paddlePriceId : resolvePriceIdFromEnv(plan);
        return {
          plan,
          tier: config.tier,
          interval: config.interval,
          trialEligible: config.trialEligible && trialDays > 0,
          checkoutEnabled: Boolean(priceId),
          source:
            row?.active && row.paddlePriceId
              ? "db"
              : priceId
                ? "env"
                : "missing",
        };
      }),
    );

    return {
      trialDays,
      plans,
    };
  },
});

export const getPriceForPlan = queryGeneric({
  args: {
    plan: v.union(
      v.literal("pro_monthly"),
      v.literal("pro_yearly"),
      v.literal("pro_plus_monthly"),
      v.literal("pro_plus_yearly"),
    ),
  },
  handler: async (ctx, { plan }) => {
    const priceId = await resolveCheckoutPlanPriceId(ctx.db, plan);
    return {
      plan,
      priceId,
      checkoutEnabled: Boolean(priceId),
    };
  },
});

export const adminUpsertPrice = mutationGeneric({
  args: {
    forwardSecret: v.optional(v.string()),
    plan: v.union(
      v.literal("pro_monthly"),
      v.literal("pro_yearly"),
      v.literal("pro_plus_monthly"),
      v.literal("pro_plus_yearly"),
    ),
    paddlePriceId: v.string(),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, { forwardSecret, plan, paddlePriceId, active }) => {
    const expectedSecret = process.env.PADDLE_WEBHOOK_FORWARD_SECRET;
    const forwardAllowed =
      Boolean(expectedSecret) && forwardSecret === expectedSecret;
    if (!forwardAllowed) {
      await requireSupportOperator(ctx);
    }
    const now = Date.now();
    const config = BILLING_PLAN_CONFIGS[plan];
    const existing = await getRowByPlan(ctx.db, plan);
    const nextActive = active ?? true;

    if (existing) {
      await ctx.db.patch(existing._id, {
        tier: config.tier,
        interval: config.interval,
        trialEligible: config.trialEligible,
        paddlePriceId: paddlePriceId.trim(),
        active: nextActive,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("billingPlanPrices", {
      plan,
      tier: config.tier,
      interval: config.interval,
      trialEligible: config.trialEligible,
      paddlePriceId: paddlePriceId.trim(),
      active: nextActive,
      createdAt: now,
      updatedAt: now,
    });
  },
});
