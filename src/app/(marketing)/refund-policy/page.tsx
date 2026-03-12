import type { Metadata } from "next";
import DisplayMenu from "@/components/DisplayMenu";
import BrandLogo from "@/components/BrandLogo";
import MarketingFooter from "@/components/MarketingFooter";
import MarketingAuthActions from "@/components/MarketingAuthActions";
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
            <DisplayMenu />
            <MarketingAuthActions
              signInLabel={dict.common.signIn}
              signUpLabel={dict.common.signUp}
            />
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
              {zh ? "1. Paddle 作为 Merchant of Record" : "1. Paddle as Merchant of Record"}
            </h2>
            <p className="mt-2">
              {zh
                ? "aiankipro.com 上的付款由 Paddle 处理。对于通过 Paddle 完成的交易，Paddle 是 Merchant of Record。"
                : "Payments on aiankipro.com are processed by Paddle. For purchases completed through Paddle, Paddle acts as the Merchant of Record."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "2. 退款请求" : "2. Refund Requests"}
            </h2>
            <p className="mt-2">
              {zh
                ? "退款由 Paddle 按个案酌情处理。若 Paddle 发现欺诈、退款滥用或其他操纵行为，可能拒绝退款请求。"
                : "Refunds are provided at Paddle's sole discretion, on a case-by-case basis, and may be refused. Paddle may refuse a refund request where there is evidence of fraud, refund abuse, or other manipulative behaviour."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "3. 消费者法定权利" : "3. Consumer Rights"}
            </h2>
            <p className="mt-2">
              {zh
                ? "本政策不会影响你作为消费者就“与描述不符、存在缺陷或不适合其用途”的产品所享有的法定权利。"
                : "This policy does not affect your statutory rights as a consumer in relation to products or services that are not as described, faulty, or not fit for purpose."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "4. 取消订阅" : "4. Subscription Cancellations"}
            </h2>
            <p className="mt-2">
              {zh
                ? "你可随时取消订阅以停止未来续费。取消后，当前已付费订阅期内的访问权限将持续至该计费周期结束。"
                : "You may cancel your subscription at any time to stop future renewals. After cancellation, access continues until the end of the current paid billing period."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "5. 联系方式与账单支持" : "5. Contact and Billing Support"}
            </h2>
            <p className="mt-2">
              {zh
                ? "如需账单协助或希望就退款请求获得帮助，请附上 Paddle 收据号与账户邮箱联系我们。"
                : "If you need billing assistance or help with a refund request, contact us with your Paddle receipt number and account email."}
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
