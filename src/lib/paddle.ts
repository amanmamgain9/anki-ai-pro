import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import { getBillingPlanConfig, type BillingPlan } from "@/lib/billing-plans";

function resolvePaddleEnvironment(value: string | undefined): Environment {
  if (!value || value === "sandbox") return Environment.sandbox;
  if (value === "production") return Environment.production;
  throw new Error("Invalid PADDLE_ENV. Use 'sandbox' or 'production'.");
}

export function getPaddleClient() {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing PADDLE_API_KEY");
  }
  return new Paddle(apiKey, {
    environment: resolvePaddleEnvironment(process.env.PADDLE_ENV),
  });
}

export function getPaddlePriceId(plan: BillingPlan) {
  const config = getBillingPlanConfig(plan);
  const priceId = resolvePriceId(config.envVars, config.legacyEnvVars);
  if (!priceId) {
    const preferred = config.envVars.join(" or ");
    const fallback = config.legacyEnvVars?.length
      ? ` (fallback: ${config.legacyEnvVars.join(" or ")})`
      : "";
    throw new Error(`Missing ${preferred}${fallback}`);
  }
  return priceId;
}

export function isCheckoutPlanConfigured(plan: BillingPlan) {
  const config = getBillingPlanConfig(plan);
  return Boolean(resolvePriceId(config.envVars, config.legacyEnvVars));
}

function resolvePriceId(
  envVars: readonly string[],
  legacyEnvVars?: readonly string[],
) {
  for (const envVar of envVars) {
    const value = process.env[envVar];
    if (value && value.length > 0) return value;
  }
  if (!legacyEnvVars) return null;
  for (const envVar of legacyEnvVars) {
    const value = process.env[envVar];
    if (value && value.length > 0) return value;
  }
  return null;
}

export function getPaddleWebhookSecret() {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Missing PADDLE_WEBHOOK_SECRET");
  }
  return secret;
}

export function getPaddleForwardSecret() {
  const secret = process.env.PADDLE_WEBHOOK_FORWARD_SECRET;
  if (!secret) {
    throw new Error("Missing PADDLE_WEBHOOK_FORWARD_SECRET");
  }
  return secret;
}

export async function priceHasExpectedTrial(
  priceId: string,
  expectedDays: number,
) {
  const price = await getPaddleClient().prices.get(priceId);
  if (expectedDays <= 0) {
    return !price.trialPeriod;
  }
  return Boolean(
    price.trialPeriod &&
      price.trialPeriod.interval === "day" &&
      price.trialPeriod.frequency === expectedDays &&
      price.trialPeriod.requiresPaymentMethod,
  );
}
