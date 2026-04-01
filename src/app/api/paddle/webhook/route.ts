import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { NextResponse } from "next/server";
import {
  getPaddleForwardSecret,
  getPaddleWebhookSecret,
  getPaddleWebhookVerifier,
} from "@/lib/paddle";
import { buildPaddleWebhookMutationArgs } from "@/lib/paddle-webhook";

const api = anyApi;

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("paddle-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing paddle-signature header" },
      { status: 400 },
    );
  }

  const rawBody = await request.text();

  let event: {
    eventId: string;
    eventType: string;
    occurredAt?: string;
    data: unknown;
  };

  try {
    const webhookSecret = getPaddleWebhookSecret();
    event = await getPaddleWebhookVerifier().unmarshal(rawBody, webhookSecret, signature);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const mutationArgs = buildPaddleWebhookMutationArgs(event, rawBody);
    if (!mutationArgs) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_CONVEX_URL" },
        { status: 500 },
      );
    }

    const convex = new ConvexHttpClient(convexUrl);

    await convex.mutation(api.billing.processPaddleWebhook, {
      forwardSecret: getPaddleForwardSecret(),
      ...mutationArgs,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal webhook error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
