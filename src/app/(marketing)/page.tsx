import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import BrandLogo from "@/components/BrandLogo";
import MarketingFooter from "@/components/MarketingFooter";
import MarketingHeaderLinks from "@/components/MarketingHeaderLinks";
import { getServerDictionary } from "@/i18n/server";

export default async function MarketingHome() {
  const session = await getServerSession(authOptions);
  const isSignedIn = !!session?.user;
  const { dict, locale } = await getServerDictionary();
  const focusItems = dict.marketing.home.focusItems;
  const stories = dict.marketing.home.stories;
  const cohorts = dict.marketing.home.cohorts;
  const features = dict.marketing.home.features;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ── Nav ─────────────────────────────────────── */}
      <header className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <BrandLogo iconSize={28} priority />
          <MarketingHeaderLinks
            aboutLabel={dict.common.about}
            pricingLabel={dict.common.pricing}
            contactLabel={dict.common.contact}
            className="hidden items-center justify-center gap-6 md:flex"
          />
          <div className="flex items-center gap-2 justify-self-end">
          <LocaleSwitcher />
          <ThemeToggle />
          {!isSignedIn && (
            <>
            <Link
              href="/sign-in"
              className="hidden text-sm font-semibold text-[var(--color-text-secondary)] transition hover:text-[var(--color-text)] sm:inline-flex"
            >
              {dict.common.signIn}
            </Link>
            <Link href="/sign-in" className="btn-primary">
              {dict.common.getStarted}
            </Link>
            </>
          )}
          {isSignedIn && (
            <Link href="/cards" className="btn-primary">
              {dict.marketing.home.openApp}
            </Link>
          )}
          </div>
        </div>
        <MarketingHeaderLinks
          aboutLabel={dict.common.about}
          pricingLabel={dict.common.pricing}
          contactLabel={dict.common.contact}
          className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 md:hidden"
        />
      </header>

      {/* ── Hero ────────────────────────────────────── */}
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-20 text-center sm:px-6 sm:py-28">
        <div className="mb-6 inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[var(--color-accent)]">
          {dict.marketing.home.badge}
        </div>

        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
          {dict.marketing.home.titleTop}
          <br />
          <span className="gradient-text">{dict.marketing.home.titleHighlight}</span>
        </h1>

        <p className="mx-auto mt-6 max-w-3xl text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
          {dict.marketing.home.desc}
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          {!isSignedIn && (
            <>
            <Link href="/sign-in" className="btn-primary !px-7 !py-3 !text-sm">
              {dict.marketing.home.getStartedFree}
            </Link>
            <Link href="/about" className="btn-secondary !px-7 !py-3 !text-sm">
              {dict.marketing.home.learnMore}
            </Link>
            </>
          )}
          {isSignedIn && (
            <Link href="/cards" className="btn-primary !px-7 !py-3 !text-sm">
              {dict.marketing.home.openCards}
            </Link>
          )}
        </div>
      </section>

      {/* ── Focus ───────────────────────────────────── */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
        <h2 className="mb-5 text-center text-xl font-bold tracking-tight sm:text-2xl">
          {dict.marketing.home.focusTitle}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {focusItems.map((item) => (
            <div key={item.title} className="card-surface p-5">
              <h3 className="text-sm font-bold uppercase tracking-wide">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Stories ─────────────────────────────────── */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
        <h2 className="mb-5 text-center text-xl font-bold tracking-tight sm:text-2xl">
          {dict.marketing.home.storiesTitle}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {stories.map((story) => (
            <div key={story.title} className="card-surface p-5">
              <h3 className="text-sm font-bold uppercase tracking-wide">{story.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {story.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Cohorts ─────────────────────────────────── */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
        <h2 className="mb-5 text-center text-xl font-bold tracking-tight sm:text-2xl">
          {dict.marketing.home.cohortsTitle}
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cohorts.map((cohort) => (
            <div key={cohort.title} className="card-surface p-5">
              <h3 className="text-sm font-bold uppercase tracking-wide">{cohort.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {cohort.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────── */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
        <h2 className="mb-5 text-center text-xl font-bold tracking-tight sm:text-2xl">
          {dict.marketing.home.featuresTitle}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="card-surface glow-hover scanline p-5"
            >
              <h3 className="text-sm font-bold uppercase tracking-wide">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <MarketingFooter locale={locale} />
    </div>
  );
}
