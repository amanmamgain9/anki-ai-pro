"use client";

import { anyApi } from "convex/server";
import { useQuery } from "convex/react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { useI18n } from "@/i18n/client";

const api = anyApi;
type CheckoutPlan =
  | "pro_monthly"
  | "pro_plus_monthly";
type BillingState = {
  isActive?: boolean;
  plan?: "free" | "pro" | "pro_plus";
  subscriptionStatus?: string | null;
  paddleCustomerId?: string | null;
  trialActive?: boolean;
  trialEndsAt?: number | null;
  proPreviewQuotaChars?: number | null;
  proPreviewUsedChars?: number | null;
  proPreviewRemainingChars?: number | null;
};

export default function SettingsView() {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const { data: session } = useSession();
  const billing = useQuery(api.billing.getMyBilling) as BillingState | undefined;
  const [busyAction, setBusyAction] = useState<CheckoutPlan | "portal" | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const trialEndsAt = typeof billing?.trialEndsAt === "number" ? billing.trialEndsAt : null;
  const trialDaysLeft =
    trialEndsAt === null ? 0 : Math.max(0, Math.ceil((trialEndsAt - Date.now()) / 86_400_000));

  async function startCheckout(plan: CheckoutPlan) {
    setShowUpgradeModal(false);
    setBillingError(null);
    setBusyAction(plan);
    try {
      const response = await fetch("/api/paddle/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const payload = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(payload.error ?? "Failed to create Paddle checkout");
      }
      window.location.href = payload.checkoutUrl;
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function openPortal() {
    setBillingError(null);
    setBusyAction("portal");
    try {
      const response = await fetch("/api/paddle/portal", {
        method: "POST",
      });
      const payload = (await response.json()) as { portalUrl?: string; error?: string };
      if (!response.ok || !payload.portalUrl) {
        throw new Error(payload.error ?? "Failed to open customer portal");
      }
      window.location.href = payload.portalUrl;
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Portal failed");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight"><span className="gradient-text">{zh ? "设置" : "Settings"}</span></h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{zh ? "管理你的账户和偏好设置。" : "Manage your account and preferences."}</p>
      </div>
      <div className="card-surface p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">{zh ? "账户" : "Account"}</h2>
        <p className="mt-3 text-sm">
          <span className="font-semibold">{zh ? "姓名：" : "Name:"}</span> {session?.user?.name ?? (zh ? "Google 用户" : "Google User")}
        </p>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          <span className="font-semibold text-[var(--color-text)]">{zh ? "邮箱：" : "Email:"}</span> {session?.user?.email ?? (zh ? "不可用" : "Not available")}
        </p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="btn-secondary mt-4"
        >
          {zh ? "退出登录" : "Sign out"}
        </button>
      </div>
      <div className="card-surface p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">{zh ? "计费" : "Billing"}</h2>
        <p className="mt-3 text-sm">
          <span className="font-semibold">{zh ? "套餐：" : "Plan:"}</span>{" "}
          {billing?.isActive
            ? billing?.plan === "pro_plus"
              ? (zh ? "专业增强版" : "Pro+")
              : (zh ? "专业版" : "Pro")
            : (zh ? "免费版" : "Free")}
        </p>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          <span className="font-semibold text-[var(--color-text)]">{zh ? "订阅状态：" : "Subscription status:"}</span>{" "}
          {billing?.subscriptionStatus ?? (zh ? "无" : "none")}
        </p>
        {billing?.trialActive && (
          <p className="mt-1 text-sm text-[var(--color-accent)]">
            {zh
              ? `免费 Pro+ 试用进行中（剩余约 ${trialDaysLeft} 天）。`
              : `Free Pro+ trial is active (${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left).`}
          </p>
        )}
        {billing?.isActive && billing?.plan === "pro" && typeof billing.proPreviewQuotaChars === "number" && (
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {zh
              ? `本月 Pro+ 语音体验额度：剩余 ${billing.proPreviewRemainingChars ?? 0} / ${billing.proPreviewQuotaChars} 字符（已用 ${billing.proPreviewUsedChars ?? 0}）。`
              : `Monthly Pro+ voice preview: ${billing.proPreviewRemainingChars ?? 0} / ${billing.proPreviewQuotaChars} characters left (${billing.proPreviewUsedChars ?? 0} used).`}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowUpgradeModal(true)}
            className="btn-primary"
            disabled={busyAction !== null}
          >
            {busyAction && busyAction !== "portal"
              ? (zh ? "打开中..." : "Opening...")
              : billing?.isActive
                ? (zh ? "更改套餐" : "Change plan")
                : (zh ? "升级" : "Upgrade")}
          </button>
          <button
            type="button"
            onClick={openPortal}
            className="btn-secondary"
            disabled={busyAction !== null || !billing?.paddleCustomerId}
          >
            {busyAction === "portal" ? (zh ? "打开中..." : "Opening...") : (zh ? "管理账单" : "Manage billing")}
          </button>
        </div>
        {billingError && (
          <p className="mt-3 text-sm text-[var(--color-danger)]">{billingError}</p>
        )}
      </div>
      {showUpgradeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold">{zh ? "选择套餐" : "Choose your plan"}</h3>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {zh ? "选择结算周期后将跳转到 Paddle 结账页面。" : "Pick a billing cycle to continue to Paddle checkout."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              >
                {zh ? "关闭" : "Close"}
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--color-border)] p-3">
                <p className="text-sm font-semibold">{zh ? "Pro" : "Pro"}</p>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{zh ? "$8 / 月" : "$8 / month"}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startCheckout("pro_monthly")}
                    className="btn-primary !px-3 !py-1.5 !text-xs"
                    disabled={busyAction !== null}
                  >
                    {busyAction === "pro_monthly" ? (zh ? "打开中..." : "Opening...") : (zh ? "月付" : "Monthly")}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] p-3">
                <p className="text-sm font-semibold">{zh ? "Pro+" : "Pro+"}</p>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{zh ? "$20 / 月" : "$20 / month"}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startCheckout("pro_plus_monthly")}
                    className="btn-primary !px-3 !py-1.5 !text-xs"
                    disabled={busyAction !== null}
                  >
                    {busyAction === "pro_plus_monthly" ? (zh ? "打开中..." : "Opening...") : (zh ? "月付" : "Monthly")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="card-surface p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">{zh ? "法律" : "Legal"}</h2>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link href="/terms" className="text-[var(--color-accent)] hover:underline">
            {zh ? "服务条款" : "Terms of Service"}
          </Link>
          <Link href="/privacy" className="text-[var(--color-accent)] hover:underline">
            {zh ? "隐私政策" : "Privacy Notice"}
          </Link>
          <Link href="/refund-policy" className="text-[var(--color-accent)] hover:underline">
            {zh ? "退款政策" : "Refund Policy"}
          </Link>
        </div>
      </div>
    </div>
  );
}
