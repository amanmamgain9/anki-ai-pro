import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import BrandLogo from "@/components/BrandLogo";
import MarketingFooter from "@/components/MarketingFooter";
import { getServerDictionary } from "@/i18n/server";

export default async function AboutPage() {
  const { dict, locale } = await getServerDictionary();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <BrandLogo iconSize={28} />
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          <Link href="/sign-in" className="btn-primary">{dict.common.getStarted}</Link>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-16 sm:px-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {dict.marketing.about.title}{" "}
            <span className="gradient-text">{dict.marketing.about.titleHighlight}</span>
          </h1>
          <p className="mt-3 max-w-xl text-base text-[var(--color-text-secondary)]">
            {dict.marketing.about.intro}
          </p>
        </div>

        <div className="space-y-5">
          <div className="card-surface glow-hover p-6">
            <h2 className="text-sm font-bold uppercase tracking-wide">
              {dict.marketing.about.whyTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {dict.marketing.about.whyBody}
            </p>
          </div>

          <div className="card-surface glow-hover p-6">
            <h2 className="text-sm font-bold uppercase tracking-wide">
              {dict.marketing.about.realtimeTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {dict.marketing.about.realtimeBody}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Link href="/" className="btn-secondary">
            ← {dict.marketing.about.backHome}
          </Link>
          <Link href="/sign-in" className="btn-primary">
            {dict.common.createAccount}
          </Link>
        </div>
      </section>
      <MarketingFooter locale={locale} />
    </div>
  );
}
