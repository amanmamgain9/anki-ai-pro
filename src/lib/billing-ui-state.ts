export type BillingUiStateInput = {
  isActive?: boolean;
  accessSource?: "none" | "manual" | "subscription" | "subscription_trial";
  manualAccessTier?: string | null;
  billingPortalAvailable?: boolean;
  blockingSubscriptionIds?: string[] | null;
  merchantReviewRequired?: boolean;
};

export function deriveBillingUiState(billing: BillingUiStateInput | null | undefined) {
  const isActive = Boolean(billing?.isActive);
  const hasManualAccess =
    billing?.accessSource === "manual" || Boolean(billing?.manualAccessTier);
  const hasBlockingSubscriptions = (billing?.blockingSubscriptionIds?.length ?? 0) > 0;
  const merchantReviewRequired = Boolean(billing?.merchantReviewRequired);
  const billingPortalAvailable = Boolean(billing?.billingPortalAvailable);

  const requiresSupport = Boolean(
    hasManualAccess ||
      merchantReviewRequired ||
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
    requiresSupport,
    canManageInPortal,
    requiresBillingPortal,
    settingsShouldOpenBillingPortal,
    startTrialShouldShowManagement,
    startTrialShouldRedirectToApp,
  };
}
