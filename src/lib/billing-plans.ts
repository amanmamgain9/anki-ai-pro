export const BILLING_PLAN_ORDER = [
  "pro_monthly",
] as const;
export const PUBLIC_BILLING_PLAN_ORDER = ["pro_monthly"] as const;

export type BillingPlan = (typeof BILLING_PLAN_ORDER)[number];
// Sellable checkout plans currently resolve only to the Pro tier.
// Pro+ remains an internal/manual entitlement tier, not a public checkout plan.
export type BillingTier = "pro" | "pro_plus";
export type BillingInterval = "monthly";

export type BillingPlanConfig = {
  plan: BillingPlan;
  tier: BillingTier;
  interval: BillingInterval;
  trialEligible: boolean;
  envVars: readonly string[];
  legacyEnvVars?: readonly string[];
};

const BILLING_PLAN_CONFIGS: Record<BillingPlan, BillingPlanConfig> = {
  pro_monthly: {
    plan: "pro_monthly",
    tier: "pro",
    interval: "monthly",
    trialEligible: true,
    envVars: ["PADDLE_PRICE_ID_PRO_MONTHLY"],
    legacyEnvVars: ["PADDLE_PRICE_ID_MONTHLY"],
  },
};

export function parseBillingPlan(input: unknown): BillingPlan | null {
  if (typeof input !== "string") return null;
  if (input === "monthly") return "pro_monthly";
  if ((BILLING_PLAN_ORDER as readonly string[]).includes(input)) {
    return input as BillingPlan;
  }
  return null;
}

export function getBillingPlanConfig(plan: BillingPlan): BillingPlanConfig {
  return BILLING_PLAN_CONFIGS[plan];
}

export function listBillingPlanConfigs(): BillingPlanConfig[] {
  return BILLING_PLAN_ORDER.map((plan) => BILLING_PLAN_CONFIGS[plan]);
}

export function listPublicBillingPlanConfigs(): BillingPlanConfig[] {
  return PUBLIC_BILLING_PLAN_ORDER.map((plan) => BILLING_PLAN_CONFIGS[plan]);
}
