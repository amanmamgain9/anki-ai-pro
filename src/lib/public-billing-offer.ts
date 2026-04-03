import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const api = anyApi;

export async function getPublicProMonthlyTrialDays() {
  try {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
    }
    const convex = new ConvexHttpClient(convexUrl);
    const payload = (await convex.query(api.billing.getBillingPlansPublic, {})) as {
      trialDays: number;
      plans: Array<{
        plan: string;
        trialEligible: boolean;
        checkoutEnabled: boolean;
      }>;
    };
    const publicOffer = payload.plans.find((row) => row.plan === "pro_monthly");
    return publicOffer?.checkoutEnabled && publicOffer.trialEligible ? payload.trialDays : 0;
  } catch {
    return 0;
  }
}
