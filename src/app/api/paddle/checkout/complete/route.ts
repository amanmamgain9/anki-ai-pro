import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { verifyAndRecordCheckoutCompletion } from "@/lib/paddle-checkout-verification";

export const runtime = "nodejs";

export async function POST(request: Request) {
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

    const body = (await request.json()) as { sessionId?: unknown; transactionId?: unknown };
    const sessionId =
      typeof body.sessionId === "string" && body.sessionId.length > 0 ? body.sessionId : null;
    const transactionId =
      typeof body.transactionId === "string" && body.transactionId.length > 0
        ? body.transactionId
        : null;
    if (!sessionId) {
      return NextResponse.json({ error: "Missing checkout session id" }, { status: 400 });
    }
    if (!transactionId) {
      return NextResponse.json({ error: "Missing transaction id" }, { status: 400 });
    }

    await verifyAndRecordCheckoutCompletion(session, {
      sessionId,
      transactionId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
