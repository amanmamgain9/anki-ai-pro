import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import AppPageClient from "@/components/AppPageClient";
import { authOptions } from "@/lib/auth";
import { verifyAndRecordCheckoutCompletion } from "@/lib/paddle-checkout-verification";
import { sanitizeInternalReturnPath } from "@/lib/return-path";

const api = anyApi;

type BillingState = {
  isActive?: boolean;
  accessSource?: "none" | "manual" | "subscription" | "subscription_trial";
  manualAccessTier?: string | null;
  portalManagementAvailable?: boolean;
  blockingSubscriptionIds?: string[] | null;
  merchantReviewRequired?: boolean;
};

type OnboardingState = {
  hasCompletedOnboarding?: boolean;
};

function buildAppPath(
  pathSegments: string[] | undefined,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const pathname = `/${(pathSegments ?? []).join("/")}`;
  const normalizedPath = pathname === "/" ? "/cards" : pathname;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      query.set(key, value);
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    }
  }
  const search = query.toString();
  return search ? `${normalizedPath}?${search}` : normalizedPath;
}

export default async function AppCatchAllPage({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ path }, query] = await Promise.all([params, searchParams]);
  const currentPath = buildAppPath(path, query);
  const session = await getServerSession(authOptions);

  if (!session?.convexToken) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(currentPath)}`);
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
  }

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(session.convexToken);
  await convex.mutation(api.billing.syncCurrentUser, {});

  const billingSuccess = query.billing === "success";
  const checkoutCompletionSessionId =
    typeof query.checkoutSessionId === "string" && query.checkoutSessionId.length > 0
      ? query.checkoutSessionId
      : null;
  const checkoutCompletionTransactionId =
    typeof query.transactionId === "string" && query.transactionId.length > 0
      ? query.transactionId
      : null;
  if (billingSuccess && checkoutCompletionSessionId && checkoutCompletionTransactionId) {
    try {
      await verifyAndRecordCheckoutCompletion(session, {
        sessionId: checkoutCompletionSessionId,
        transactionId: checkoutCompletionTransactionId,
      });
    } catch {
      // Best effort. Webhook reconciliation may still complete the purchase.
    }
  }

  const [billing, onboarding] = await Promise.all([
    convex.query(api.billing.getMyBilling, {}) as Promise<BillingState>,
    convex.query(api.billing.getMyOnboardingState, {}) as Promise<OnboardingState>,
  ]);

  const isBillingStartRoute =
    currentPath === "/start-trial" || currentPath.startsWith("/start-trial?");
  const hasProAccess = Boolean(billing?.isActive);
  const hasManualAccess =
    billing?.accessSource === "manual" || Boolean(billing?.manualAccessTier);
  const hasBlockingSubscriptions = (billing?.blockingSubscriptionIds?.length ?? 0) > 0;
  const portalManagementAvailable = Boolean(billing?.portalManagementAvailable);
  const requiresBillingManagement =
    !hasManualAccess && hasBlockingSubscriptions && portalManagementAvailable;
  const requiresSupport =
    hasManualAccess ||
    (Boolean(billing?.merchantReviewRequired) && !portalManagementAvailable) ||
    (hasBlockingSubscriptions && !requiresBillingManagement);
  const returnPath = sanitizeInternalReturnPath(
    typeof query.from === "string" ? query.from : null,
  );

  if (checkoutCompletionSessionId || checkoutCompletionTransactionId) {
    if (isBillingStartRoute && billingSuccess && hasProAccess && !requiresBillingManagement && !requiresSupport) {
      redirect(returnPath);
    }
    if (currentPath === "/settings" || currentPath.startsWith("/settings?")) {
      redirect("/settings?billing=success");
    }
    if (isBillingStartRoute) {
      redirect(`/start-trial?billing=success&from=${encodeURIComponent(returnPath)}`);
    }
  }

  if (!hasProAccess && !isBillingStartRoute) {
    redirect(`/start-trial?from=${encodeURIComponent(currentPath)}`);
  }

  if (isBillingStartRoute && hasProAccess && !requiresBillingManagement && !requiresSupport) {
    redirect(returnPath);
  }

  if (
    hasProAccess &&
    !onboarding?.hasCompletedOnboarding &&
    (currentPath === "/cards" || currentPath.startsWith("/cards?"))
  ) {
    redirect("/cards/generate?onboarding=1");
  }

  return <AppPageClient initialPath={currentPath} showUpgradeCta={!hasProAccess} />;
}
