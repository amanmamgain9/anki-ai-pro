import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default function AboutPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="gradient-text text-lg font-bold tracking-tight">
          ANKI CARDS
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/sign-up" className="btn-primary">Get started</Link>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-16 sm:px-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Designed for <span className="gradient-text">serious study</span>
          </h1>
          <p className="mt-3 max-w-xl text-base text-[var(--color-text-secondary)]">
            Anki Flashcards helps you build recall with structured Markdown
            notes, diagrams, and real-time collaboration.
          </p>
        </div>

        <div className="space-y-5">
          <div className="card-surface glow-hover p-6">
            <h2 className="text-sm font-bold uppercase tracking-wide">
              Why Markdown?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              Markdown keeps your content portable and fast to edit. Pair it
              with Mermaid and you get visual context right where you need it,
              without leaving your study flow.
            </p>
          </div>

          <div className="card-surface glow-hover p-6">
            <h2 className="text-sm font-bold uppercase tracking-wide">
              Real-time by default
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              Convex provides WebSocket-based reactivity. Edit a card on your
              laptop and see the change on your phone instantly.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Link href="/" className="btn-secondary">
            ← Back home
          </Link>
          <Link href="/sign-up" className="btn-primary">
            Create account
          </Link>
        </div>
      </section>
    </div>
  );
}
