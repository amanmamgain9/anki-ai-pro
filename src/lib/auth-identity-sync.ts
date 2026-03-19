import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const api = anyApi;

export type CanonicalAuthIdentityInput = {
  provider?: string;
  providerSubject?: string;
  externalIdHint?: string;
  email?: string;
  name?: string;
  imageUrl?: string;
};

type CanonicalAuthIdentityResult = {
  externalId: string;
};

function getConvexUrl() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
  }
  return url;
}

function getServerForwardSecret() {
  const secret = process.env.PADDLE_WEBHOOK_FORWARD_SECRET;
  if (!secret) {
    throw new Error("Missing PADDLE_WEBHOOK_FORWARD_SECRET");
  }
  return secret;
}

export async function syncCanonicalAuthIdentity(
  input: CanonicalAuthIdentityInput,
) {
  const convex = new ConvexHttpClient(getConvexUrl());
  return (await convex.mutation(api.authUsers.syncSessionIdentity, {
    forwardSecret: getServerForwardSecret(),
    ...input,
  })) as CanonicalAuthIdentityResult;
}
