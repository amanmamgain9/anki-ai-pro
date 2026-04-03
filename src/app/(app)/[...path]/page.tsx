import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import AppPageClient from "@/components/AppPageClient";
import { authOptions } from "@/lib/auth";
import { verifyAndRecordCheckoutCompletion } from "@/lib/paddle-checkout-verification";
import { sanitizeInternalReturnPath } from "@/lib/return-path";
import { deriveBillingUiState } from "@/lib/billing-ui-state";

const api = anyApi;

type BillingState = {
  isActive?: boolean;
  accessSource?: "none" | "manual" | "subscription" | "subscription_trial";
  manualAccessTier?: string | null;
  blockingSubscriptionIds?: string[] | null;
  merchantReviewRequired?: boolean;
  billingPortalAvailable?: boolean;
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

function normalizeAppPathForComparison(path: string) {
  const url = new URL(path, "https://app.local");
  const entries = Array.from(url.searchParams.entries()).sort(([aKey, aValue], [bKey, bValue]) =>
    aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey),
  );
  const normalizedQuery = new URLSearchParams();
  for (const [key, value] of entries) {
    normalizedQuery.append(key, value);
  }
  const search = normalizedQuery.toString();
  return search ? `${url.pathname}?${search}` : url.pathname;
}

function redirectIfChanged(currentPath: string, targetPath: string) {
  if (normalizeAppPathForComparison(currentPath) !== normalizeAppPathForComparison(targetPath)) {
    redirect(targetPath);
  }
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
  let checkoutCompletionVerified = false;
  const hasCheckoutCompletionContext = Boolean(
    billingSuccess && checkoutCompletionSessionId && checkoutCompletionTransactionId,
  );
  if (billingSuccess && checkoutCompletionSessionId && checkoutCompletionTransactionId) {
    try {
      await verifyAndRecordCheckoutCompletion(session, {
        sessionId: checkoutCompletionSessionId,
        transactionId: checkoutCompletionTransactionId,
      });
      checkoutCompletionVerified = true;
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
  const uiState = deriveBillingUiState(billing);
  const returnPath = sanitizeInternalReturnPath(
    typeof query.from === "string" ? query.from : null,
  );
  const checkoutCompletionPending =
    hasCheckoutCompletionContext && !checkoutCompletionVerified && !hasProAccess;
  const isSettingsRoute = currentPath === "/settings" || currentPath.startsWith("/settings?");
  const canRenderCheckoutCompletionState =
    checkoutCompletionPending && (isBillingStartRoute || isSettingsRoute);

  if (checkoutCompletionSessionId || checkoutCompletionTransactionId) {
    const shouldShowCheckoutSuccess =
      checkoutCompletionVerified || hasProAccess || checkoutCompletionPending;
    if (isBillingStartRoute && billingSuccess && uiState.startTrialShouldRedirectToApp) {
      redirect(returnPath);
    }
    if (isSettingsRoute) {
      const targetPath = shouldShowCheckoutSuccess
        ? `/settings?billing=success${
            checkoutCompletionPending && checkoutCompletionSessionId && checkoutCompletionTransactionId
              ? `&checkoutSessionId=${encodeURIComponent(checkoutCompletionSessionId)}&transactionId=${encodeURIComponent(checkoutCompletionTransactionId)}`
              : ""
          }`
        : "/settings";
      redirectIfChanged(currentPath, targetPath);
    }
    if (isBillingStartRoute) {
      const targetPath = shouldShowCheckoutSuccess
        ? `/start-trial?billing=success&from=${encodeURIComponent(returnPath)}${
            checkoutCompletionPending && checkoutCompletionSessionId && checkoutCompletionTransactionId
              ? `&checkoutSessionId=${encodeURIComponent(checkoutCompletionSessionId)}&transactionId=${encodeURIComponent(checkoutCompletionTransactionId)}`
              : ""
          }`
        : `/start-trial?from=${encodeURIComponent(returnPath)}`;
      redirectIfChanged(currentPath, targetPath);
    }
    if (checkoutCompletionPending) {
      const targetPath = `/start-trial?billing=success&from=${encodeURIComponent(returnPath)}&checkoutSessionId=${encodeURIComponent(
        checkoutCompletionSessionId ?? "",
      )}&transactionId=${encodeURIComponent(checkoutCompletionTransactionId ?? "")}`;
      redirectIfChanged(currentPath, targetPath);
    }
  }

  if (!hasProAccess && !isBillingStartRoute && !canRenderCheckoutCompletionState) {
    redirect(`/start-trial?from=${encodeURIComponent(currentPath)}`);
  }

  if (isBillingStartRoute && uiState.startTrialShouldRedirectToApp) {
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
