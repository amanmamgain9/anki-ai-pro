import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import MarketingFooter from "@/components/MarketingFooter";
import { getServerDictionary } from "@/i18n/server";

export const metadata: Metadata = {
  title: "Privacy Notice | Anki Cards",
  description: "Privacy notice for aiankipro.com",
};

export default async function PrivacyPage() {
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
          {zh ? "隐私政策" : "Privacy Notice"}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {dict.marketing.legal.lastUpdated}
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "1. 我们收集的信息" : "1. Information We Collect"}
            </h2>
            <p className="mt-2">
              {zh
                ? "我们会从你的登录提供方收集账户信息（如姓名、邮箱、头像），并收集你创建的应用内容和运行安全所需的技术日志。"
                : "We collect account details from your sign-in provider (such as name, email, and profile image), app content you create, and technical logs needed to run and secure the service."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "2. 支付" : "2. Payments"}
            </h2>
            <p className="mt-2">
              {zh
                ? "支付由 Paddle 处理。我们不会保存完整银行卡信息，但会保存 Paddle 客户与订阅标识用于账单管理。"
                : "Payments are handled by Paddle. We do not store your full card details. We may store Paddle customer and subscription identifiers to manage billing."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "3. 信息使用方式" : "3. How We Use Information"}
            </h2>
            <p className="mt-2">
              {zh
                ? "我们使用这些信息来提供服务、验证身份、处理订阅、提升稳定性并响应支持请求。"
                : "We use your information to provide the product, authenticate your account, process subscriptions, improve reliability, and respond to support requests."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "4. 信息共享" : "4. Sharing"}
            </h2>
            <p className="mt-2">
              {zh
                ? "我们仅在必要范围内与服务提供商共享数据（如托管、数据库、认证、支付），并在法律要求时披露。"
                : "We share data only with service providers needed to operate the app (for example hosting, database, auth, and payments) and when required by law."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "5. 数据保留" : "5. Retention"}
            </h2>
            <p className="mt-2">
              {zh
                ? "在你的账户有效期间，以及为满足法律、安全和财务合规要求所需的期限内，我们会保留相关数据。"
                : "We retain data while your account is active and as needed for legal, security, and accounting obligations."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "6. 联系方式" : "6. Contact"}
            </h2>
            <p className="mt-2">
              {zh ? "如有隐私相关请求或问题，请联系：" : "For privacy requests or questions, contact:"}{" "}
              <a href="mailto:planmyworkday@gmail.com" className="text-[var(--color-accent)] hover:underline">
                planmyworkday@gmail.com
              </a>
            </p>
          </section>
        </div>
      </section>

      <MarketingFooter locale={locale} />
    </div>
  );
}
