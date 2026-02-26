import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import MarketingFooter from "@/components/MarketingFooter";
import { getServerDictionary } from "@/i18n/server";

export const metadata: Metadata = {
  title: "Terms of Service | Anki Cards",
  description: "Terms of Service for aiankipro.com",
};

export default async function TermsPage() {
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
                ? "付费订阅由 Paddle 处理。套餐会自动续费，直到你取消。你可以在应用内账单入口管理或取消订阅。"
                : "Paid subscriptions are processed by Paddle. Plans renew automatically until canceled. You can manage or cancel your subscription from the in-app billing portal."}
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
                ? "你不得将本服务用于违法活动、滥用、未授权访问或干扰平台运行。"
                : "You may not use the service for unlawful activity, abuse, unauthorized access, or interference with platform operation."}
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
              <a href="mailto:support@aiankipro.com" className="text-[var(--color-accent)] hover:underline">
                support@aiankipro.com
              </a>
            </p>
          </section>
        </div>
      </section>

      <MarketingFooter locale={locale} />
    </div>
  );
}
