import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!session.convexToken) {
      return NextResponse.json(
        { error: "Missing Convex auth token in session" },
        { status: 401 },
      );
    }
    return NextResponse.json(
      {
        error:
          "Billing changes for this product are handled by support. Contact support from the app and include your account email.",
      },
      { status: 409 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
