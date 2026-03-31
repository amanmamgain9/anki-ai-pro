/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConvexError } from "convex/values";
import { findCanonicalUserByIdentity } from "./billingIdentity";
import { isRecognizedSubscription, resolvePaidPlanAccess } from "./paidPlanAccess";
import { pickEffectiveSubscription } from "./subscriptionAccess";

type EntitlementIdentity = {
  subject?: string;
  provider?: string;
  providerSubject?: string;
  email?: string;
} & Record<string, unknown>;

type EntitlementCtx = {
  auth: {
    getUserIdentity: () => Promise<EntitlementIdentity | null>;
  };
  db: any;
};

function getIdentityClaim(identity: EntitlementIdentity, key: string): string | undefined {
  const value = identity[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function getEntitledExternalUserId(ctx: EntitlementCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const subject = identity?.subject ?? null;
  if (!subject || !identity) return null;

  const user = await findCanonicalUserByIdentity(ctx.db, {
    externalId: subject,
    provider: getIdentityClaim(identity, "provider"),
    providerSubject: getIdentityClaim(identity, "providerSubject"),
    email: getIdentityClaim(identity, "email"),
  });
  if (!user) return null;

  const subscriptions = await ctx.db
    .query("subscriptions")
    .withIndex("by_userId_updatedAt", (q: any) => q.eq("userId", user._id))
    .order("desc")
    .collect();
  const recognizedSubscriptions = (
    await Promise.all(
      subscriptions.map(async (row: any) => ({
        row,
        recognized: await isRecognizedSubscription(ctx.db, row),
      })),
    )
  )
    .filter(({ recognized }) => recognized)
    .map(({ row }) => row);
  const access = await resolvePaidPlanAccess(
    ctx.db,
    pickEffectiveSubscription(recognizedSubscriptions, Date.now()),
    user,
    Date.now(),
  );

  if (access.isActive) {
    return user.externalId;
  }

  return null;
}

export async function requireEntitledExternalUserId(ctx: EntitlementCtx) {
  const externalId = await getEntitledExternalUserId(ctx);
  if (!externalId) throw new ConvexError("Pro plan required");
  return externalId;
}
