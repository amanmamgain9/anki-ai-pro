import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import BrandLogo from "@/components/BrandLogo";
import MarketingFooter from "@/components/MarketingFooter";
import { getServerDictionary } from "@/i18n/server";

export default async function MarketingHome() {
  const session = await getServerSession(authOptions);
  const isSignedIn = !!session?.user;
  const { dict, locale } = await getServerDictionary();

  const features = dict.marketing.home.features.map((feature, index) => ({
    ...feature,
    icon:
      index === 0 ? (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
        </svg>
      ) : index === 1 ? (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="8" y="14" width="7" height="7" rx="1" /><path d="M6.5 10v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10" /><path d="M11.5 12.5V14" />
        </svg>
      ) : index === 2 ? (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          <path d="M8 10h8" />
          <path d="M8 14h5" />
        </svg>
      ) : (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      ),
  }));

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ── Nav ─────────────────────────────────────── */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <BrandLogo iconSize={28} priority />
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          {!isSignedIn && (
            <>
            <Link
              href="/sign-in"
              className="text-sm font-semibold text-[var(--color-text-secondary)] transition hover:text-[var(--color-text)]"
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
      </header>

      {/* ── Hero ────────────────────────────────────── */}
      <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4 py-20 text-center sm:px-6 sm:py-28">
        <div className="mb-6 inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[var(--color-accent)]">
          {dict.marketing.home.badge}
        </div>

        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
          {dict.marketing.home.titleTop}
          <br />
          <span className="gradient-text">{dict.marketing.home.titleHighlight}</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
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

      {/* ── Features ────────────────────────────────── */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="card-surface glow-hover scanline p-6"
            >
              <div
                className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              >
                {f.icon}
              </div>
              <h3 className="text-sm font-bold uppercase tracking-wide">
                {f.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
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
