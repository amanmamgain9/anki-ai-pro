/* eslint-disable @typescript-eslint/no-explicit-any */
import type { UserIdentity } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutationGeneric, queryGeneric } from "convex/server";
import type { Doc } from "./_generated/dataModel";

export type BillingPlan = "pro_monthly";
// Sellable checkout plans currently resolve only to the Pro tier.
// Pro+ remains an internal/manual entitlement tier, not a public checkout plan.
export type BillingTier = "pro" | "pro_plus";
type BillingInterval = "monthly";
// Price IDs that have ever been sold should remain mapped in app config/DB.
// They may be deactivated for new checkout, but old sold prices should not be removed.

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
    noTrialEnvVars?: readonly string[];
  }
> = {
  pro_monthly: {
    plan: "pro_monthly",
    tier: "pro",
    interval: "monthly",
    trialEligible: true,
    envVars: ["PADDLE_PRICE_ID_PRO_MONTHLY"],
    legacyEnvVars: ["PADDLE_PRICE_ID_MONTHLY"],
    noTrialEnvVars: ["PADDLE_PRICE_ID_PRO_MONTHLY_NO_TRIAL"],
  },
};
const BILLING_PLAN_ORDER: BillingPlan[] = ["pro_monthly"];
const PUBLIC_BILLING_PLAN_ORDER: BillingPlan[] = ["pro_monthly"];

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

function resolvePriceIdFromEnv(
  plan: BillingPlan,
  options?: { trialEligible?: boolean },
) {
  const config = BILLING_PLAN_CONFIGS[plan];
  if (options?.trialEligible === false) {
    for (const envVar of config.noTrialEnvVars ?? []) {
      const value = process.env[envVar];
      if (value && value.length > 0) return value;
    }
    return null;
  }
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

async function getRowsByPriceId(db: any, priceId: string) {
  return (await db
    .query("billingPlanPrices")
    .withIndex("by_priceId", (q: any) => q.eq("paddlePriceId", priceId))
    .collect()) as Doc<"billingPlanPrices">[];
}

function pickNewestRow<T extends { updatedAt: number; createdAt: number }>(rows: T[]): T | null {
  return [...rows].sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return b.createdAt - a.createdAt;
  })[0] ?? null;
}

async function getActiveRowByPlanAndTrialEligibility(
  db: any,
  plan: BillingPlan,
  trialEligible: boolean,
) {
  const rows = await getRowsByPlan(db, plan);
  return pickNewestRow(
    rows.filter((row) => row.active && row.trialEligible === trialEligible),
  );
}

export function listBillingPlanConfigs() {
  return BILLING_PLAN_ORDER.map((plan) => BILLING_PLAN_CONFIGS[plan]);
}

export function listPublicBillingPlanConfigs() {
  return PUBLIC_BILLING_PLAN_ORDER.map((plan) => BILLING_PLAN_CONFIGS[plan]);
}

export async function resolveCheckoutPlanPriceId(
  db: any,
  plan: BillingPlan,
  options?: { trialEligible?: boolean },
) {
  const trialEligible = options?.trialEligible !== false;
  const row = await getActiveRowByPlanAndTrialEligibility(db, plan, trialEligible);
  if (row?.active && row.paddlePriceId) {
    return row.paddlePriceId;
  }
  return resolvePriceIdFromEnv(plan, { trialEligible });
}

export async function resolveBillingTierByPriceId(
  db: any,
  priceId: string | undefined,
): Promise<BillingTier | null> {
  if (!priceId) return null;

  const rows = await getRowsByPriceId(db, priceId);
  const mappedTiers = Array.from(
    new Set(
      rows
        .map((row) => row.tier)
        .filter((tier): tier is BillingTier => tier === "pro" || tier === "pro_plus"),
    ),
  );
  if (mappedTiers.length === 1) {
    return mappedTiers[0];
  }
  if (mappedTiers.length > 1) {
    return null;
  }

  const envMatchedTiers = new Set<BillingTier>();
  for (const [plan, config] of Object.entries(BILLING_PLAN_CONFIGS) as Array<
    [BillingPlan, (typeof BILLING_PLAN_CONFIGS)[BillingPlan]]
  >) {
    if (
      resolvePriceIdFromEnv(plan, { trialEligible: true }) === priceId ||
      resolvePriceIdFromEnv(plan, { trialEligible: false }) === priceId
    ) {
      envMatchedTiers.add(config.tier);
    }
  }
  if (envMatchedTiers.size === 1) {
    return Array.from(envMatchedTiers)[0];
  }
  return null;
}

export async function resolveBillingPlanByPriceId(
  db: any,
  priceId: string | undefined,
): Promise<BillingPlan | null> {
  if (!priceId) return null;

  const rows = await getRowsByPriceId(db, priceId);
  const mappedPlans = Array.from(
    new Set(
      rows
        .map((row) => row.plan)
        .filter((plan): plan is BillingPlan => plan === "pro_monthly"),
    ),
  );
  if (mappedPlans.length === 1) {
    return mappedPlans[0];
  }
  if (mappedPlans.length > 1) {
    return null;
  }

  const envMatchedPlans = new Set<BillingPlan>();
  for (const [plan] of Object.entries(BILLING_PLAN_CONFIGS) as Array<
    [BillingPlan, (typeof BILLING_PLAN_CONFIGS)[BillingPlan]]
  >) {
    if (
      resolvePriceIdFromEnv(plan, { trialEligible: true }) === priceId ||
      resolvePriceIdFromEnv(plan, { trialEligible: false }) === priceId
    ) {
      envMatchedPlans.add(plan);
    }
  }
  if (envMatchedPlans.size === 1) {
    return Array.from(envMatchedPlans)[0];
  }
  return null;
}

export function resolveBillingTierByPlan(
  plan: string | undefined,
): BillingTier | null {
  if (!plan) return null;
  const config = BILLING_PLAN_CONFIGS[plan as BillingPlan];
  return config?.tier ?? null;
}

export const listPublic = queryGeneric({
  handler: async (ctx) => {
    const trialDays = resolveFreeProPlusTrialDays();
    const plans = await Promise.all(
      PUBLIC_BILLING_PLAN_ORDER.map(async (plan) => {
        const config = BILLING_PLAN_CONFIGS[plan];
        const priceId = await resolveCheckoutPlanPriceId(ctx.db, plan, {
          trialEligible: true,
        });
        return {
          plan,
          tier: config.tier,
          interval: config.interval,
          trialEligible: config.trialEligible && trialDays > 0,
          checkoutEnabled: Boolean(priceId),
          source: priceId ? "configured" : "missing",
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
    plan: v.literal("pro_monthly"),
    trialEligible: v.optional(v.boolean()),
  },
  handler: async (ctx, { plan, trialEligible }) => {
    const priceId = await resolveCheckoutPlanPriceId(ctx.db, plan, {
      trialEligible: trialEligible !== false,
    });
    return {
      plan,
      priceId,
      trialEligible: trialEligible !== false,
      checkoutEnabled: Boolean(priceId),
    };
  },
});

export const adminUpsertPrice = mutationGeneric({
  args: {
    forwardSecret: v.optional(v.string()),
    plan: v.literal("pro_monthly"),
    paddlePriceId: v.string(),
    active: v.optional(v.boolean()),
    trialEligible: v.optional(v.boolean()),
  },
  handler: async (ctx, { forwardSecret, plan, paddlePriceId, active, trialEligible }) => {
    const expectedSecret = process.env.PADDLE_WEBHOOK_FORWARD_SECRET;
    const forwardAllowed =
      Boolean(expectedSecret) && forwardSecret === expectedSecret;
    if (!forwardAllowed) {
      await requireSupportOperator(ctx);
    }
    const now = Date.now();
    const config = BILLING_PLAN_CONFIGS[plan];
    const resolvedTrialEligible = trialEligible ?? config.trialEligible;
    const normalizedPriceId = paddlePriceId.trim();
    if (normalizedPriceId.length === 0) {
      throw new ConvexError("Paddle price ID is required");
    }
    const existingRows = await getRowsByPlan(ctx.db, plan);
    const priceRows = await getRowsByPriceId(ctx.db, normalizedPriceId);
    const conflictingRow = priceRows.find((row) => row.plan !== plan);
    if (conflictingRow) {
      throw new ConvexError("Paddle price ID is already assigned to another plan");
    }
    const matchingRow = pickNewestRow(
      existingRows.filter((row) => row.paddlePriceId === normalizedPriceId),
    );
    const nextActive = active ?? true;

    if (nextActive) {
      for (const row of existingRows) {
        if (matchingRow && row._id === matchingRow._id) continue;
        if (!matchingRow && row.paddlePriceId === normalizedPriceId) continue;
        if (!row.active) continue;
        if (row.trialEligible !== resolvedTrialEligible) continue;
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
        trialEligible: resolvedTrialEligible,
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
      trialEligible: resolvedTrialEligible,
      paddlePriceId: normalizedPriceId,
      active: nextActive,
      createdAt: now,
      updatedAt: now,
    });
  },
});
