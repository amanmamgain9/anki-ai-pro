import { Environment, Paddle } from "@paddle/paddle-node-sdk";

export type BillingPlan = "monthly" | "yearly";

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
  const monthlyPriceId = process.env.PADDLE_PRICE_ID_MONTHLY;
  const yearlyPriceId = process.env.PADDLE_PRICE_ID_YEARLY;

  if (plan === "monthly") {
    if (!monthlyPriceId) {
      throw new Error("Missing PADDLE_PRICE_ID_MONTHLY");
    }
    return monthlyPriceId;
  }

  if (!yearlyPriceId) {
    throw new Error("Missing PADDLE_PRICE_ID_YEARLY");
  }
  return yearlyPriceId;
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
