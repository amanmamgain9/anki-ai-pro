import Link from "next/link";
import DisplayMenu from "@/components/DisplayMenu";
import BrandLogo from "@/components/BrandLogo";
import MarketingFooter from "@/components/MarketingFooter";
import MarketingAuthActions from "@/components/MarketingAuthActions";
import MarketingHeaderLinks from "@/components/MarketingHeaderLinks";
import { interpolateMessage } from "@/i18n/format";
import { getServerDictionary } from "@/i18n/server";
import { resolveFreeProPlusTrialDays } from "@/lib/trials";

export default async function PricingPage() {
  const { dict, locale } = await getServerDictionary();
  const trialDays = resolveFreeProPlusTrialDays();
  const subtitle =
    trialDays > 0
      ? interpolateMessage(dict.marketing.pricing.subtitleWithTrial, { count: trialDays })
      : dict.marketing.pricing.subtitleNoTrial;
  const tiers = [
    {
      ...dict.marketing.pricing.tiers.pro,
      href: "/sign-in",
      accent: false,
    },
    {
      ...dict.marketing.pricing.tiers.proPlus,
      cta:
        trialDays > 0
          ? interpolateMessage(dict.marketing.pricing.tiers.proPlus.ctaWithTrial, {
              count: trialDays,
            })
          : dict.marketing.pricing.tiers.proPlus.ctaNoTrial,
      href: "/sign-in",
      accent: true,
    },
  ];

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

      <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {dict.marketing.pricing.title}{" "}
          <span className="gradient-text">{dict.marketing.pricing.titleHighlight}</span>
        </h1>
        <p className="mt-3 max-w-md text-center text-base text-[var(--color-text-secondary)]">
          {subtitle}
        </p>

        <div className="mt-12 grid w-full max-w-5xl gap-5 sm:grid-cols-2">
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
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                  {dict.marketing.pricing.perMonth}
                </span>
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

        <div className="card-surface mt-8 w-full max-w-5xl p-6">
          <h2 className="text-sm font-bold uppercase tracking-wide">
            {dict.marketing.pricing.deliverablesTitle}
          </h2>
          <ul className="mt-3 space-y-2.5">
            {dict.marketing.pricing.deliverables.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-[var(--color-text-secondary)]">
                <span className="mt-[0.45rem] block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <MarketingFooter locale={locale} />
    </div>
  );
}
