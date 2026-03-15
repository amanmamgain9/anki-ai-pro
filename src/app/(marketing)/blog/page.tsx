import type { Metadata } from "next";
import Link from "next/link";
import DisplayMenu from "@/components/DisplayMenu";
import BrandLogo from "@/components/BrandLogo";
import MarketingFooter from "@/components/MarketingFooter";
import MarketingAuthActions from "@/components/MarketingAuthActions";
import MarketingHeaderLinks from "@/components/MarketingHeaderLinks";
import { getServerDictionary } from "@/i18n/server";

export const metadata: Metadata = {
  title: "Blog | Anki Cards",
  description: "Practical learning workflows and flashcard study guides.",
};

export default async function BlogIndexPage() {
  const { dict, locale } = await getServerDictionary();
  const blog = dict.marketing.blogIndex;

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

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-12 sm:px-6 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-accent)]">
          {blog.badge}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {blog.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
          {blog.subtitle}
        </p>

        <div className="mt-10 border-y border-[var(--color-border)]">
          <article className="py-7">
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
              <span>{blog.date}</span>
              <span aria-hidden>•</span>
              <span>{blog.category}</span>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">
              {blog.articleTitle}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-[var(--color-text-secondary)]">
              {blog.articleDesc}
            </p>
            <Link href="/blog/sleep-learning-audio" className="mt-4 inline-flex text-sm font-semibold text-[var(--color-accent)] hover:underline">
              {blog.readMore}
            </Link>
          </article>
        </div>
      </section>

      <MarketingFooter locale={locale} />
    </div>
  );
}
