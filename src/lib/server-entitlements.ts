import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";

const api = anyApi;

type BillingState = {
  isActive?: boolean;
  trialActive?: boolean;
};

export async function ensureProAccess(session: Session | null) {
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.convexToken) {
    return NextResponse.json(
      { error: "Missing Convex auth token in session" },
      { status: 401 },
    );
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json(
      { error: "Missing NEXT_PUBLIC_CONVEX_URL" },
      { status: 500 },
    );
  }

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(session.convexToken);

  // Ensure a user row exists before reading subscription-backed billing state.
  await convex.mutation(api.billing.syncCurrentUser, {});
  const billing = (await convex.query(api.billing.getMyBilling, {})) as BillingState;
  if (billing?.isActive || billing?.trialActive) {
    return null;
  }

  return NextResponse.json(
    { error: "Pro plan required. Start a Pro+ trial or upgrade in Settings." },
    { status: 402 },
  );
}
