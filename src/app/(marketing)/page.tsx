import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import ThemeToggle from "@/components/ThemeToggle";

const features = [
  {
    title: "Markdown-first",
    desc: "Headings, code blocks, tables, and checklists. Your content stays portable.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
      </svg>
    ),
  },
  {
    title: "Mermaid diagrams",
    desc: "Flowcharts, sequence diagrams, and architecture sketches inline.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="8" y="14" width="7" height="7" rx="1" /><path d="M6.5 10v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10" /><path d="M11.5 12.5V14" />
      </svg>
    ),
  },
  {
    title: "Real-time sync",
    desc: "Convex pushes changes over WebSockets. Edits appear instantly everywhere.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
];

export default function MarketingHome() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* ── Nav ─────────────────────────────────────── */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="gradient-text text-lg font-bold tracking-tight">
          ANKI CARDS
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <SignedOut>
            <Link
              href="/sign-in"
              className="text-sm font-semibold text-[var(--color-text-secondary)] transition hover:text-[var(--color-text)]"
            >
              Sign in
            </Link>
            <Link href="/sign-up" className="btn-primary">
              Get started
            </Link>
          </SignedOut>
          <SignedIn>
            <Link href="/cards" className="btn-primary">
              Open app
            </Link>
          </SignedIn>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────── */}
      <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4 py-20 text-center sm:px-6 sm:py-28">
        <div className="mb-6 inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[var(--color-accent)]">
          Open-source study tool
        </div>

        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
          Study smarter with
          <br />
          <span className="gradient-text">Markdown cards.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
          Create richly formatted flashcards, render diagrams inline, and
          sync changes in real time across all your devices.
        </p>

        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <SignedOut>
            <Link href="/sign-up" className="btn-primary !px-7 !py-3 !text-sm">
              Get started free
            </Link>
            <Link href="/about" className="btn-secondary !px-7 !py-3 !text-sm">
              Learn more
            </Link>
          </SignedOut>
          <SignedIn>
            <Link href="/cards" className="btn-primary !px-7 !py-3 !text-sm">
              Open your cards
            </Link>
          </SignedIn>
        </div>
      </section>

      {/* ── Features ────────────────────────────────── */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-3">
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

      {/* ── Footer ──────────────────────────────────── */}
      <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs font-semibold text-[var(--color-text-tertiary)] sm:px-6">
          <span className="gradient-text">ANKI CARDS</span>
          <div className="flex gap-5">
            <Link href="/about" className="transition hover:text-[var(--color-text-secondary)]">About</Link>
            <Link href="/pricing" className="transition hover:text-[var(--color-text-secondary)]">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
