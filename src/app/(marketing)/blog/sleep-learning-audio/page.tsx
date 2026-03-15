import type { Metadata } from "next";
import Link from "next/link";
import DisplayMenu from "@/components/DisplayMenu";
import BrandLogo from "@/components/BrandLogo";
import MarketingFooter from "@/components/MarketingFooter";
import MarketingAuthActions from "@/components/MarketingAuthActions";
import MarketingHeaderLinks from "@/components/MarketingHeaderLinks";
import { getServerDictionary } from "@/i18n/server";

export const metadata: Metadata = {
  title: "Sleep Learning with Audio | AIANKIPRO Blog",
  description:
    "A bedtime workflow to replace doom scrolling with voice-first card review: Learn mode first, then Shuffle mode for recall.",
};

export default async function SleepLearningAudioBlogPage() {
  const { dict, locale } = await getServerDictionary();
  const blog = dict.marketing.sleepAudioBlog;

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

      <article className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <Link href="/blog" className="text-xs font-semibold text-[var(--color-accent)] hover:underline">
          {blog.backToBlog}
        </Link>
        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-accent)]">
            {blog.category}
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {blog.title}
          </h1>
          <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
            {blog.publishedOn}
          </p>

          <div className="mt-8 h-px bg-[var(--color-border)]" />

          <div className="mt-8 space-y-6 text-base leading-8 text-[var(--color-text-secondary)]">
          <section>
            <h2 className="text-lg font-bold text-[var(--color-text)] sm:text-xl">{blog.sections[0].title}</h2>
            <p className="mt-2">{blog.sections[0].body}</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--color-text)] sm:text-xl">{blog.sections[1].title}</h2>
            <p className="mt-2">{blog.sections[1].body}</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--color-text)] sm:text-xl">{blog.sections[2].title}</h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              {blog.sections[2].bullets?.map((bullet) => <li key={bullet}>{bullet}</li>)}
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--color-text)] sm:text-xl">{blog.sections[3].title}</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              {blog.sections[3].bullets?.map((bullet) => <li key={bullet}>{bullet}</li>)}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--color-text)] sm:text-xl">{blog.sections[4].title}</h2>
            <p className="mt-2 font-medium text-[var(--color-text)]">{blog.sections[4].body}</p>
          </section>
          </div>
        </div>
      </article>

      <MarketingFooter locale={locale} />
    </div>
  );
}
