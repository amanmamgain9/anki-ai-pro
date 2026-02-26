import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import MarketingFooter from "@/components/MarketingFooter";
import { getServerDictionary } from "@/i18n/server";

export const metadata: Metadata = {
  title: "Refund Policy | Anki Cards",
  description: "Refund policy for aiankipro.com subscriptions",
};

export default async function RefundPolicyPage() {
  const { dict, locale } = await getServerDictionary();
  const zh = locale === "zh";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="gradient-text text-lg font-bold tracking-tight">
          {dict.common.appName}
        </Link>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          <Link href="/pricing" className="btn-secondary">
            {dict.marketing.legal.pricingCta}
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {zh ? "退款政策" : "Refund Policy"}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {dict.marketing.legal.lastUpdated}
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "1. 免费方案" : "1. Free Plan"}
            </h2>
            <p className="mt-2">
              {zh ? "免费方案不产生费用。" : "The free plan is not billed."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "2. 订阅收费" : "2. Subscription Charges"}
            </h2>
            <p className="mt-2">
              {zh
                ? "付费方案按周期预先扣费，若未在下一个计费日前取消，则会自动续费。"
                : "Paid plans are charged in advance and renew automatically unless canceled before the next billing date."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "3. 首次购买退款" : "3. Initial Purchase Refunds"}
            </h2>
            <p className="mt-2">
              {zh
                ? "若这是你首次购买付费订阅且对服务不满意，可在购买后 7 天内申请退款。"
                : "If this is your first paid subscription and you are not satisfied, you may request a refund within 7 days of purchase."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "4. 续费退款" : "4. Renewal Refunds"}
            </h2>
            <p className="mt-2">
              {zh
                ? "续费款项通常不予退款，法律另有规定的除外。"
                : "Renewal payments are generally non-refundable, except where required by applicable law."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "5. 如何申请退款" : "5. How to Request a Refund"}
            </h2>
            <p className="mt-2">
              {zh ? "请发送邮件至 " : "Email "}{" "}
              <a href="mailto:support@aiankipro.com" className="text-[var(--color-accent)] hover:underline">
                support@aiankipro.com
              </a>{" "}
              {zh
                ? "并附上账户邮箱与 Paddle 收据详情。我们通常会在 3 个工作日内回复。"
                : "with your account email and Paddle receipt details. We typically respond within 3 business days."}
            </p>
          </section>
        </div>
      </section>

      <MarketingFooter locale={locale} />
    </div>
  );
}
