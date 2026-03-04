import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import BrandLogo from "@/components/BrandLogo";
import MarketingFooter from "@/components/MarketingFooter";
import { getServerDictionary } from "@/i18n/server";

export default async function AboutPage() {
  const { dict, locale } = await getServerDictionary();
  const modes = dict.marketing.about.modes;
  const flowSteps = dict.marketing.about.flowSteps;
  const cohorts = dict.marketing.about.cohorts;
  const principles = dict.marketing.about.principles;

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

      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-14 px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            {dict.marketing.about.title}{" "}
            <span className="gradient-text">{dict.marketing.about.titleHighlight}</span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
            {dict.marketing.about.intro}
          </p>
        </div>

        <div>
          <div className="card-surface glow-hover p-6">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
              {dict.marketing.about.problemTitle}
            </h2>
            <p className="mt-3 max-w-4xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
              {dict.marketing.about.problemBody}
            </p>
          </div>
        </div>

        <div>
          <h2 className="mb-5 text-xl font-bold tracking-tight sm:text-2xl">
            {dict.marketing.about.modesTitle}
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {modes.map((mode) => (
              <div key={mode.title} className="card-surface p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide">{mode.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {mode.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-5 text-xl font-bold tracking-tight sm:text-2xl">
            {dict.marketing.about.flowTitle}
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {flowSteps.map((step, idx) => (
              <div key={step.title} className="card-surface p-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-accent)]">
                  {idx + 1}
                </p>
                <h3 className="mt-2 text-sm font-bold uppercase tracking-wide">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-5 text-xl font-bold tracking-tight sm:text-2xl">
            {dict.marketing.about.cohortsTitle}
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cohorts.map((item) => (
              <div key={item.title} className="card-surface p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-5 text-xl font-bold tracking-tight sm:text-2xl">
            {dict.marketing.about.principlesTitle}
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {principles.map((item) => (
              <div key={item.title} className="card-surface glow-hover p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {item.desc}
                </p>
              </div>
            ))}
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
