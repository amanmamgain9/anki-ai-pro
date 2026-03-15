/* eslint-disable @typescript-eslint/no-explicit-any */
import type { UserIdentity } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutationGeneric, queryGeneric } from "convex/server";
import type { Doc } from "./_generated/dataModel";

export type BillingPlan = "pro_monthly" | "pro_plus_monthly";
type BillingTier = "pro" | "pro_plus";
type BillingInterval = "monthly";

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
  pro_plus_monthly: {
    plan: "pro_plus_monthly",
    tier: "pro_plus",
    interval: "monthly",
    trialEligible: true,
    envVars: ["PADDLE_PRICE_ID_PRO_PLUS_MONTHLY"],
  },
};
const BILLING_PLAN_ORDER: BillingPlan[] = ["pro_monthly", "pro_plus_monthly"];

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

async function getRowsByPlan(db: any, plan: BillingPlan) {
  return (await db
    .query("billingPlanPrices")
    .withIndex("by_plan", (q: any) => q.eq("plan", plan))
    .collect()) as Doc<"billingPlanPrices">[];
}

function pickNewestRow<T extends { updatedAt: number; createdAt: number }>(rows: T[]): T | null {
  return [...rows].sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return b.createdAt - a.createdAt;
  })[0] ?? null;
}

async function getActiveRowByPlan(db: any, plan: BillingPlan) {
  const rows = (await db
    .query("billingPlanPrices")
    .withIndex("by_active_plan", (q: any) => q.eq("active", true).eq("plan", plan))
    .collect()) as Doc<"billingPlanPrices">[];
  return pickNewestRow(rows);
}

export function listBillingPlanConfigs() {
  return BILLING_PLAN_ORDER.map((plan) => BILLING_PLAN_CONFIGS[plan]);
}

export async function resolveCheckoutPlanPriceId(db: any, plan: BillingPlan) {
  const row = await getActiveRowByPlan(db, plan);
  if (row?.active && row.paddlePriceId) {
    return row.paddlePriceId;
  }
  return resolvePriceIdFromEnv(plan);
}

export async function resolveBillingTierByPriceId(
  db: any,
  priceId: string | undefined,
): Promise<BillingTier | null> {
  if (!priceId) return null;

  const row = await db
    .query("billingPlanPrices")
    .withIndex("by_priceId", (q: any) => q.eq("paddlePriceId", priceId))
    .first();
  if (row && (row.tier === "pro" || row.tier === "pro_plus")) {
    return row.tier;
  }

  for (const [plan, config] of Object.entries(BILLING_PLAN_CONFIGS) as Array<
    [BillingPlan, (typeof BILLING_PLAN_CONFIGS)[BillingPlan]]
  >) {
    if (resolvePriceIdFromEnv(plan) === priceId) {
      return config.tier;
    }
  }
  return null;
}

export const listPublic = queryGeneric({
  handler: async (ctx) => {
    const trialDays = resolveFreeProPlusTrialDays();
    const plans = await Promise.all(
      (Object.keys(BILLING_PLAN_CONFIGS) as BillingPlan[]).map(async (plan) => {
        const config = BILLING_PLAN_CONFIGS[plan];
        const row = await getActiveRowByPlan(ctx.db, plan);
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
      v.literal("pro_plus_monthly"),
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
      v.literal("pro_plus_monthly"),
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
    const normalizedPriceId = paddlePriceId.trim();
    const existingRows = await getRowsByPlan(ctx.db, plan);
    const matchingRow =
      existingRows.find((row: any) => row.paddlePriceId === normalizedPriceId) ?? null;
    const nextActive = active ?? true;

    if (nextActive) {
      for (const row of existingRows) {
        if (matchingRow && row._id === matchingRow._id) continue;
        if (!matchingRow && row.paddlePriceId === normalizedPriceId) continue;
        if (!row.active) continue;
        await ctx.db.patch(row._id, {
          active: false,
          updatedAt: now,
        });
      }
    }

    if (matchingRow) {
      await ctx.db.patch(matchingRow._id, {
        tier: config.tier,
        interval: config.interval,
        trialEligible: config.trialEligible,
        paddlePriceId: normalizedPriceId,
        active: nextActive,
        updatedAt: now,
      });
      return matchingRow._id;
    }

    return await ctx.db.insert("billingPlanPrices", {
      plan,
      tier: config.tier,
      interval: config.interval,
      trialEligible: config.trialEligible,
      paddlePriceId: normalizedPriceId,
      active: nextActive,
      createdAt: now,
      updatedAt: now,
    });
  },
});
