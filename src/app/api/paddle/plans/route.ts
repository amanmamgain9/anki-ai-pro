import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { NextResponse } from "next/server";
import { listPublicBillingPlanConfigs } from "@/lib/billing-plans";
import { priceHasExpectedTrial } from "@/lib/paddle";
import { resolveFreeProPlusTrialDays } from "@/lib/trials";

const api = anyApi;

export const runtime = "nodejs";

export async function GET() {
  const trialDays = resolveFreeProPlusTrialDays();
  try {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_CONVEX_URL" },
        { status: 500 },
      );
    }

    const convex = new ConvexHttpClient(convexUrl);
    const payload = (await convex.query(api.billing.getBillingPlansPublic, {})) as {
      trialDays: number;
      plans: Array<{
        plan: string;
        tier: string;
        interval: string;
        trialEligible: boolean;
        checkoutEnabled: boolean;
      }>;
    };
    const plans = await Promise.all(
      payload.plans.map(async (plan) => {
        if (!plan.checkoutEnabled) {
          return plan;
        }
        const config = (await convex.query(api.billing.getCheckoutPlanConfig, {
          plan: plan.plan as "pro_monthly",
        })) as { priceId: string | null; checkoutEnabled: boolean };
        if (!config.checkoutEnabled || !config.priceId) {
          return {
            ...plan,
            checkoutEnabled: false,
            trialEligible: false,
          };
        }
        const trialVerified = await priceHasExpectedTrial(config.priceId, trialDays);
        return {
          ...plan,
          checkoutEnabled: trialVerified,
          trialEligible: plan.trialEligible && trialVerified,
        };
      }),
    );
    return NextResponse.json({
      trialDays: payload.trialDays,
      plans,
    });
  } catch {
    const plans = listPublicBillingPlanConfigs().map((config) => ({
      plan: config.plan,
      tier: config.tier,
      interval: config.interval,
      trialEligible: config.trialEligible && trialDays > 0,
      checkoutEnabled: false,
    }));
    return NextResponse.json({
      trialDays,
      plans,
      source: "fallback",
    });
  }
}
