import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import MarketingFooter from "@/components/MarketingFooter";
import { getServerDictionary } from "@/i18n/server";

export const metadata: Metadata = {
  title: "Contact | Anki Cards",
  description: "Contact and support policy for aiankipro.com",
};

export default async function ContactPage() {
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
          {zh ? "联系与支持" : "Contact & Support"}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {dict.marketing.legal.lastUpdated}
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "1. 联系邮箱" : "1. Contact Email"}
            </h2>
            <p className="mt-2">
              {zh ? "如需帮助，请联系：" : "For support, contact:"}{" "}
              <a href="mailto:support@aiankipro.com" className="text-[var(--color-accent)] hover:underline">
                support@aiankipro.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "2. 回复时间" : "2. Response Time"}
            </h2>
            <p className="mt-2">
              {zh
                ? "我们通常会在 1 个工作日内回复，多数请求会更快处理。"
                : "We typically respond within 1 business day, and many requests are handled sooner."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "3. 如何获得更快帮助" : "3. How to Get Faster Help"}
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                {zh ? "你的账户邮箱" : "Your account email"}
              </li>
              <li>
                {zh ? "问题的简短描述与复现步骤" : "A short issue description and reproduction steps"}
              </li>
              <li>
                {zh ? "相关截图或报错信息（如有）" : "Relevant screenshots or error messages (if any)"}
              </li>
              <li>
                {zh ? "账单问题请附上 Paddle 收据号" : "For billing issues, include your Paddle receipt number"}
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              {zh ? "4. 相关政策" : "4. Related Policies"}
            </h2>
            <p className="mt-2">
              {zh ? "法律与账单政策请查看：" : "For legal and billing details, see:"}{" "}
              <Link href="/terms" className="text-[var(--color-accent)] hover:underline">
                {dict.common.terms}
              </Link>
              ,{" "}
              <Link href="/privacy" className="text-[var(--color-accent)] hover:underline">
                {dict.common.privacy}
              </Link>
              ,{" "}
              <Link href="/refund-policy" className="text-[var(--color-accent)] hover:underline">
                {dict.common.refundPolicy}
              </Link>
              .
            </p>
          </section>
        </div>
      </section>

      <MarketingFooter locale={locale} />
    </div>
  );
}
