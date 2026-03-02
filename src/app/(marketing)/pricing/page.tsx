import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import BrandLogo from "@/components/BrandLogo";
import MarketingFooter from "@/components/MarketingFooter";
import { getServerDictionary } from "@/i18n/server";

export default async function PricingPage() {
  const { dict, locale } = await getServerDictionary();
  const tiers = [
    {
      ...dict.marketing.pricing.tiers.free,
      href: "/sign-in",
      accent: false,
    },
    {
      ...dict.marketing.pricing.tiers.pro,
      href: "#",
      accent: false,
    },
    {
      ...dict.marketing.pricing.tiers.proPlus,
      href: "#",
      accent: true,
    },
  ];

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

      <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {dict.marketing.pricing.title}{" "}
          <span className="gradient-text">{dict.marketing.pricing.titleHighlight}</span>
        </h1>
        <p className="mt-3 max-w-md text-center text-base text-[var(--color-text-secondary)]">
          {dict.marketing.pricing.subtitle}
        </p>

        <div className="mt-12 grid w-full max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`card-surface glow-hover flex flex-col p-6 ${
                t.accent
                  ? "!border-[var(--color-accent)] shadow-[0_0_30px_var(--color-accent-glow)]"
                  : ""
              }`}
            >
              <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--color-accent)]">
                {t.name}
              </h3>
              <p className="mt-2 text-4xl font-bold tracking-tight">
                {t.price}
                {t.price !== "$0" && (
                  <span className="text-sm font-medium text-[var(--color-text-secondary)]">{dict.marketing.pricing.perMonth}</span>
                )}
              </p>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{t.desc}</p>

              <ul className="mt-5 flex-1 space-y-2.5">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                         stroke="var(--color-success)" strokeWidth="2.5"
                         strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={t.href}
                className={`mt-6 block rounded-xl py-2.5 text-center text-sm font-bold uppercase tracking-wide transition ${
                  t.accent
                    ? "btn-primary justify-center"
                    : "btn-secondary justify-center"
                }`}
              >
                {t.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>
      <MarketingFooter locale={locale} />
    </div>
  );
}
