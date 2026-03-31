import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { listPublicBillingPlanConfigs } from "@/lib/billing-plans";
import { priceHasExpectedTrial } from "@/lib/paddle";

const api = anyApi;

export const runtime = "nodejs";

export async function GET() {
  try {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_CONVEX_URL" },
        { status: 500 },
      );
    }

    const convex = new ConvexHttpClient(convexUrl);
    const session = await getServerSession(authOptions);
    if (session?.convexToken) {
      convex.setAuth(session.convexToken);
      await convex.mutation(api.billing.syncCurrentUser, {});
      const offer = (await convex.query(api.billing.getMyCheckoutPlanConfig, {
        plan: "pro_monthly",
      })) as {
        plan: string;
        trialEligible: boolean;
        trialDays: number;
        priceId: string | null;
        checkoutEnabled: boolean;
      };
      const trialVerified =
        offer.checkoutEnabled && offer.priceId
          ? await priceHasExpectedTrial(
              offer.priceId,
              offer.trialEligible ? offer.trialDays : 0,
            )
          : false;
      return NextResponse.json({
        trialDays: offer.trialDays,
        plans: [
          {
            plan: offer.plan,
            tier: "pro",
            interval: "monthly",
            trialEligible: offer.trialEligible,
            checkoutEnabled: trialVerified,
          },
        ],
      });
    }

    const payload = (await convex.query(api.billing.getBillingPlansPublic, {})) as {
      trialDays: number;
      plans: Array<{
        plan: string;
        tier: string;
        interval: string;
        trialEligible: boolean;
        priceId?: string | null;
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
          trialEligible: plan.trialEligible,
        })) as { priceId: string | null; checkoutEnabled: boolean };
        if (!config.checkoutEnabled || !config.priceId) {
          return {
            ...plan,
            checkoutEnabled: false,
            trialEligible: false,
          };
        }
        const trialVerified = await priceHasExpectedTrial(
          config.priceId,
          plan.trialEligible ? payload.trialDays : 0,
        );
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
    const trialDays = 0;
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
