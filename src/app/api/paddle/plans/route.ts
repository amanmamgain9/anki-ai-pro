import { NextResponse } from "next/server";
import { listBillingPlanConfigs } from "@/lib/billing-plans";
import { isCheckoutPlanConfigured } from "@/lib/paddle";

function resolveFreeProPlusTrialDays() {
  const raw = process.env.FREE_PRO_PLUS_TRIAL_DAYS ?? "3";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(0, Math.floor(parsed));
}

export const runtime = "nodejs";

export async function GET() {
  const trialDays = resolveFreeProPlusTrialDays();
  const plans = listBillingPlanConfigs().map((plan) => ({
    plan: plan.plan,
    tier: plan.tier,
    interval: plan.interval,
    trialEligible: plan.trialEligible && trialDays > 0,
    checkoutEnabled: isCheckoutPlanConfigured(plan.plan),
  }));
  return NextResponse.json({
    trialDays,
    plans,
  });
}
