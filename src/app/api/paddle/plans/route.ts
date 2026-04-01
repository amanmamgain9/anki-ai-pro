import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { listPublicBillingPlanConfigs } from "@/lib/billing-plans";

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
      return NextResponse.json({
        trialDays: offer.trialDays,
        plans: [
          {
            plan: offer.plan,
            tier: "pro",
            interval: "monthly",
            trialEligible: offer.trialEligible,
            checkoutEnabled: offer.checkoutEnabled,
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
    return NextResponse.json({
      trialDays: payload.trialDays,
      plans: payload.plans,
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
