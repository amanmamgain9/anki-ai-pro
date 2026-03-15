import type { Metadata } from "next";
import DisplayMenu from "@/components/DisplayMenu";
import BrandLogo from "@/components/BrandLogo";
import MarketingFooter from "@/components/MarketingFooter";
import MarketingAuthActions from "@/components/MarketingAuthActions";
import MarketingHeaderLinks from "@/components/MarketingHeaderLinks";
import Link from "next/link";
import { getServerDictionary } from "@/i18n/server";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = {
  title: "Refund Policy | Anki Cards",
  description: "Refund policy for aiankipro.com subscriptions",
};

export default async function RefundPolicyPage() {
  const { dict, locale } = await getServerDictionary();
  const sections = dict.marketing.refundPage.sections;
  const merchantSection = sections[0] as { title: string; body: string };
  const requestSection = sections[1] as { title: string; body: string; linksIntro: string };
  const rightsSections = sections.slice(2, 4) as ReadonlyArray<{ title: string; body: string }>;
  const supportSection = sections[4] as {
    title: string;
    body: string;
    emailPrefix: string;
    emailSuffix: string;
    contactLink: string;
  };

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
          {dict.marketing.refundPage.title}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {dict.marketing.legal.lastUpdated}
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">{merchantSection.title}</h2>
            <p className="mt-2">{merchantSection.body}</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">{requestSection.title}</h2>
            <p className="mt-2">{requestSection.body}</p>
            <p className="mt-2">{requestSection.linksIntro}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <a
                  href="https://paddle.net/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--color-accent)] hover:underline"
                >
                  https://paddle.net/
                </a>
              </li>
              <li>
                <a
                  href="https://www.paddle.com/legal/invoiced-consumer-terms"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--color-accent)] hover:underline"
                >
                  https://www.paddle.com/legal/invoiced-consumer-terms
                </a>
              </li>
            </ul>
          </section>

          {rightsSections.map((section) => (
            <section key={section.title}>
              <h2 className="text-base font-bold text-[var(--color-text)]">{section.title}</h2>
              <p className="mt-2">{section.body}</p>
            </section>
          ))}

          <section>
            <h2 className="text-base font-bold text-[var(--color-text)]">{supportSection.title}</h2>
            <p className="mt-2">{supportSection.body}</p>
            <p className="mt-2">
              {supportSection.emailPrefix}{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[var(--color-accent)] hover:underline">
                {SUPPORT_EMAIL}
              </a>{" "}
              {supportSection.emailSuffix}
            </p>
            <p className="mt-2">
              <Link href="/contact" className="text-[var(--color-accent)] hover:underline">
                {supportSection.contactLink}
              </Link>
            </p>
          </section>
        </div>
      </section>

      <MarketingFooter locale={locale} />
    </div>
  );
}
