import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

const api = anyApi;

export const runtime = "nodejs";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.convexToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json(
      { error: "Missing NEXT_PUBLIC_CONVEX_URL" },
      { status: 500 },
    );
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);
    convex.setAuth(session.convexToken);

    const billing = await convex.query(api.billing.getMyBilling, {});
    const onboarding = await convex.query(api.billing.getMyOnboardingState, {});

    return NextResponse.json({ billing, onboarding });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bootstrap failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
