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
  title: "Contact | Anki Cards",
  description: "Contact and support policy for aiankipro.com",
};

export default async function ContactPage() {
  const { dict, locale } = await getServerDictionary();
  const sections = dict.marketing.contactPage.sections;
  const emailSection = sections[0] as { title: string; bodyPrefix: string };
  const responseSection = sections[1] as { title: string; body: string };
  const helpSection = sections[2] as { title: string; bullets: readonly string[] };
  const policySection = sections[3] as { title: string; bodyPrefix: string };

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
          {dict.marketing.contactPage.title}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {dict.marketing.legal.lastUpdated}
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">{emailSection.title}</h2>
            <p className="mt-2">
              {emailSection.bodyPrefix}{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[var(--color-accent)] hover:underline">
                {SUPPORT_EMAIL}
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">{responseSection.title}</h2>
            <p className="mt-2">{responseSection.body}</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">{helpSection.title}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {helpSection.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">{policySection.title}</h2>
            <p className="mt-2">
              {policySection.bodyPrefix}{" "}
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
