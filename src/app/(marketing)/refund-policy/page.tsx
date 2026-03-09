import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import BrandLogo from "@/components/BrandLogo";
import MarketingFooter from "@/components/MarketingFooter";
import MarketingHeaderLinks from "@/components/MarketingHeaderLinks";
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
      <header className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <BrandLogo iconSize={28} />
          <MarketingHeaderLinks
            aboutLabel={dict.common.about}
            pricingLabel={dict.common.pricing}
            contactLabel={dict.common.contact}
            className="hidden items-center justify-center gap-6 md:flex"
          />
          <div className="flex items-center gap-2 justify-self-end">
          <LocaleSwitcher />
          <ThemeToggle />
          <Link href="/pricing" className="btn-secondary">
            {dict.marketing.legal.pricingCta}
          </Link>
          </div>
        </div>
        <MarketingHeaderLinks
          aboutLabel={dict.common.about}
          pricingLabel={dict.common.pricing}
          contactLabel={dict.common.contact}
          className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 md:hidden"
        />
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
              {zh ? "1. 试用说明" : "1. Trial"}
            </h2>
            <p className="mt-2">
              {zh
                ? "我们为 Pro+ 提供 3 天试用。试用结束后，如未取消，订阅将按所选计费周期（月付或年付）续费。"
                : "We offer a 3-day trial for Pro+. After the trial ends, the subscription renews on the selected billing cycle (monthly or yearly) unless canceled before renewal."}
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
              {zh ? "3. 退款资格" : "3. Refund Eligibility"}
            </h2>
            <p className="mt-2">
              {zh
                ? "试用结束后的首笔订阅收费，可在收费后 14 天内申请退款。"
                : "The first paid subscription charge after trial conversion is eligible for a refund if requested within 14 days of that charge."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "4. 续费与部分周期规则" : "4. Renewals and Partial-Period Rules"}
            </h2>
            <p className="mt-2">
              {zh
                ? "续费款项通常不退款，且不提供按未使用时长比例退款。"
                : "Renewal charges are generally non-refundable, and we do not provide prorated refunds for unused time in a billing period."}
            </p>
            <p className="mt-2">
              {zh
                ? "如遇重复扣费、未经授权付款、技术性账单错误，或适用法律另有要求的情况，我们会按个案处理。"
                : "We will review exceptions for duplicate charges, unauthorized payments, technical billing errors, or where refunds are required by applicable law."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "5. 取消与账单支持" : "5. Cancellation and Billing Support"}
            </h2>
            <p className="mt-2">
              {zh
                ? "你可随时取消订阅。取消后可继续使用至当前计费周期结束，之后不再自动续费。"
                : "You may cancel at any time. Access continues until the end of the current billing period, after which the subscription will not renew."}
            </p>
            <p className="mt-2">
              {zh ? "请发送邮件至 " : "Email "}{" "}
              <a href="mailto:planmyworkday@gmail.com" className="text-[var(--color-accent)] hover:underline">
                planmyworkday@gmail.com
              </a>{" "}
              {zh
                ? "并附上 Paddle 收据号与账户邮箱。我们通常会在 1 个工作日内回复。"
                : "with your Paddle receipt number and account email for billing support. We typically respond within 1 business day."}
            </p>
          </section>
        </div>
      </section>

      <MarketingFooter locale={locale} />
    </div>
  );
}
