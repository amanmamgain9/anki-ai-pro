import type { Metadata } from "next";
import Link from "next/link";
import DisplayMenu from "@/components/DisplayMenu";
import BrandLogo from "@/components/BrandLogo";
import MarketingFooter from "@/components/MarketingFooter";
import MarketingAuthActions from "@/components/MarketingAuthActions";
import MarketingHeaderLinks from "@/components/MarketingHeaderLinks";
import { getServerDictionary } from "@/i18n/server";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = {
  title: "Terms of Service | Anki Cards",
  description: "Terms of Service for aiankipro.com",
};

export default async function TermsPage() {
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
          {zh ? "服务条款" : "Terms of Service"}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {dict.marketing.legal.lastUpdated}
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "1. 条款接受" : "1. Acceptance of Terms"}
            </h2>
            <p className="mt-2">
              {zh
                ? "使用 aiankipro.com 与 Anki Cards 应用即表示你同意本服务条款。"
                : "By using aiankipro.com and the Anki Cards application, you agree to these Terms of Service."}
            </p>
            <p className="mt-2">
              {zh
                ? "本服务由 Aman Mamgain（个体经营者）运营。"
                : "This service is operated by Aman Mamgain (sole proprietor)."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "2. 账户" : "2. Accounts"}
            </h2>
            <p className="mt-2">
              {zh
                ? "你需对账户内活动负责，并确保账户访问安全。"
                : "You are responsible for your account activity and for keeping access to your account secure."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "3. 计费与订阅" : "3. Billing and Subscriptions"}
            </h2>
            <p className="mt-2">
              {zh
                ? "付费订阅由 Paddle 处理。对于通过 Paddle 完成的交易，Paddle 作为 Merchant of Record 负责结账、支付处理，以及适用范围内的账单与退款处理。我们目前提供 Pro 与 Pro+ 的月付和年付方案。新用户可获得 3 天 Pro+ 试用。套餐会自动续费，直到你取消。你可以在应用内账单入口管理或取消订阅。"
                : "Paid subscriptions are processed by Paddle. For purchases completed through Paddle, Paddle acts as Merchant of Record and handles checkout, payment processing, and applicable billing and refund handling. We currently offer monthly Pro and Pro+ plans. New users receive a 3-day Pro+ trial. Plans renew automatically until canceled. You can manage or cancel your subscription from the in-app billing portal."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "4. 退款" : "4. Refunds"}
            </h2>
            <p className="mt-2">
              {zh ? "退款资格详见我们的" : "Refund eligibility is described in our"}{" "}
              <Link href="/refund-policy" className="text-[var(--color-accent)] hover:underline">
                {dict.common.refundPolicy}
              </Link>
              {zh ? "。" : "."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "5. 合理使用" : "5. Acceptable Use"}
            </h2>
            <p className="mt-2">
              {zh
                ? "本服务仅用于学习。你不得将本服务用于违法活动、滥用、未授权访问、干扰平台运行，或用于考试作弊、代考及其他学术不诚信行为。"
                : "This service is for learning only. You may not use the service for unlawful activity, abuse, unauthorized access, interference with platform operation, exam cheating, test impersonation, or other academic misconduct."}
            </p>
            <p className="mt-2">
              {zh
                ? "若发现违规，我们可暂停或终止账户，并在适用情况下向相关方配合处理。"
                : "If we detect violations, we may suspend or terminate accounts and cooperate with relevant parties where appropriate."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "6. 服务可用性" : "6. Service Availability"}
            </h2>
            <p className="mt-2">
              {zh
                ? "我们可能在任何时间更新、暂停或下线功能。我们会尽力保证稳定，但不承诺服务永不中断。"
                : "We may update, suspend, or discontinue features at any time. We aim for reliability but do not guarantee uninterrupted service."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "7. 联系方式" : "7. Contact"}
            </h2>
            <p className="mt-2">
              {zh ? "如有法律或账单问题，请联系：" : "For legal or billing questions, contact:"}{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[var(--color-accent)] hover:underline">
                {SUPPORT_EMAIL}
              </a>
            </p>
          </section>
        </div>
      </section>

      <MarketingFooter locale={locale} />
    </div>
  );
}
