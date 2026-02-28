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
              {zh ? "3. 不退款政策" : "3. No Refund Policy"}
            </h2>
            <p className="mt-2">
              {zh
                ? "所有订阅费用均不退款，包括部分周期未使用部分。"
                : "All subscription payments are non-refundable, including unused portions of a billing period."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "4. 取消订阅" : "4. Cancellation"}
            </h2>
            <p className="mt-2">
              {zh
                ? "你可以随时取消订阅。取消后当前计费周期内仍可继续使用，随后不再自动续费。"
                : "You may cancel your subscription at any time. Access continues until the current billing period ends, and then it will not renew automatically."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "5. 法律例外与账单支持" : "5. Legal Exceptions and Billing Support"}
            </h2>
            <p className="mt-2">
              {zh ? "请发送邮件至 " : "Email "}{" "}
              <a href="mailto:support@aiankipro.com" className="text-[var(--color-accent)] hover:underline">
                support@aiankipro.com
              </a>{" "}
              {zh
                ? "获取账单协助。若适用法律要求退款，我们会依法处理。"
                : "for billing assistance. Where refunds are required by applicable law, we will honor those requirements."}
            </p>
          </section>
        </div>
      </section>

      <MarketingFooter locale={locale} />
    </div>
  );
}
