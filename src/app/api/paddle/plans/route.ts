import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { NextResponse } from "next/server";
import { listBillingPlanConfigs } from "@/lib/billing-plans";

const api = anyApi;

export const runtime = "nodejs";

function resolveFreeProPlusTrialDays() {
  const raw = process.env.FREE_PRO_PLUS_TRIAL_DAYS ?? "3";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(0, Math.floor(parsed));
}

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
    const payload = await convex.query(api.billing.getBillingPlansPublic, {});
    return NextResponse.json(payload);
  } catch {
    const plans = listBillingPlanConfigs().map((config) => ({
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
