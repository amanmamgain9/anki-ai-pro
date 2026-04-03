export type BillingUiStateInput = {
  isActive?: boolean;
  accessSource?: "none" | "manual" | "subscription" | "subscription_trial";
  manualAccessTier?: string | null;
  billingPortalAvailable?: boolean;
  blockingSubscriptionIds?: string[] | null;
  merchantReviewRequired?: boolean;
  subscriptionStatus?: string | null;
  paddleSubscriptionId?: string | null;
};

export function deriveBillingUiState(billing: BillingUiStateInput | null | undefined) {
  const isActive = Boolean(billing?.isActive);
  const hasManualAccess =
    billing?.accessSource === "manual" || Boolean(billing?.manualAccessTier);
  const hasBlockingSubscriptions = (billing?.blockingSubscriptionIds?.length ?? 0) > 0;
  const merchantReviewRequired = Boolean(billing?.merchantReviewRequired);
  const billingPortalAvailable = Boolean(billing?.billingPortalAvailable);
  const hasLinkedSubscription = Boolean(
    typeof billing?.paddleSubscriptionId === "string" && billing.paddleSubscriptionId.length > 0,
  );
  const hasSubscriptionWithoutPortal = Boolean(
    isActive && hasLinkedSubscription && !billingPortalAvailable,
  );

  const requiresSupport = Boolean(
    hasManualAccess ||
      merchantReviewRequired ||
      hasSubscriptionWithoutPortal ||
      (!billingPortalAvailable && !isActive && hasBlockingSubscriptions),
  );
  const canManageInPortal = Boolean(!requiresSupport && billingPortalAvailable);
  const requiresBillingPortal = Boolean(canManageInPortal && hasBlockingSubscriptions);
  const settingsShouldOpenBillingPortal = Boolean(
    canManageInPortal && (isActive || hasBlockingSubscriptions),
  );
  const startTrialShouldShowManagement = Boolean(requiresSupport || requiresBillingPortal);
  const startTrialShouldRedirectToApp = Boolean(isActive && !startTrialShouldShowManagement);

  return {
    isActive,
    hasManualAccess,
    hasBlockingSubscriptions,
    merchantReviewRequired,
    billingPortalAvailable,
    hasSubscriptionWithoutPortal,
    requiresSupport,
    canManageInPortal,
    requiresBillingPortal,
    settingsShouldOpenBillingPortal,
    startTrialShouldShowManagement,
    startTrialShouldRedirectToApp,
  };
}
