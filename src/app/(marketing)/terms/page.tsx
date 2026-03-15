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
  const sections = dict.marketing.termsPage.sections;

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
          {dict.marketing.termsPage.title}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {dict.marketing.legal.lastUpdated}
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {sections.slice(0, 3).map((section) => (
            <section key={section.title}>
              <h2 className="text-base font-bold text-[var(--color-text)]">{section.title}</h2>
              {section.body?.map((paragraph) => <p key={paragraph} className="mt-2">{paragraph}</p>)}
            </section>
          ))}

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">{sections[3].title}</h2>
            <p className="mt-2">
              {sections[3].bodyPrefix}{" "}
              <Link href="/refund-policy" className="text-[var(--color-accent)] hover:underline">
                {dict.common.refundPolicy}
              </Link>
              .
            </p>
          </section>

          {sections.slice(4, 6).map((section) => (
            <section key={section.title}>
              <h2 className="text-base font-bold text-[var(--color-text)]">{section.title}</h2>
              {section.body?.map((paragraph) => <p key={paragraph} className="mt-2">{paragraph}</p>)}
            </section>
          ))}

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">{sections[6].title}</h2>
            <p className="mt-2">
              {sections[6].bodyPrefix}{" "}
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
