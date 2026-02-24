"use client";

import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import ThemeToggle from "@/components/ThemeToggle";
import { AppRouterProvider, AppLink, useAppRouter } from "@/lib/app-router";

const navItems = [
  { href: "/study", label: "Study", icon: StudyIcon },
  { href: "/cards", label: "Cards", icon: CardIcon },
  { href: "/decks", label: "Decks", icon: DeckIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const initialPath = usePathname();

  return (
    <AppRouterProvider initialPath={initialPath}>
      <AppShell>{children}</AppShell>
    </AppRouterProvider>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useAppRouter();

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:gap-6 lg:border-r lg:border-[var(--color-border)] lg:bg-[var(--color-surface)] lg:p-5">
        <AppLink href="/cards" className="gradient-text text-lg font-bold tracking-tight">
          ANKI CARDS
        </AppLink>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <AppLink key={href} href={href}
                className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                  active ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
                }`}
                style={active ? { boxShadow: "inset 3px 0 0 var(--color-accent)" } : undefined}>
                <Icon active={active} />
                {label}
              </AppLink>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 border-t border-[var(--color-border)] pt-5">
          <UserButton afterSignOutUrl="/" />
          <span className="flex-1 text-xs text-[var(--color-text-tertiary)]">Account</span>
          <ThemeToggle />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-x-hidden pb-20 lg:pb-0">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex items-center border-t border-[var(--color-border)] bg-[var(--color-surface)] backdrop-blur-xl lg:hidden">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <AppLink key={href} href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[0.625rem] font-bold uppercase tracking-wider transition ${
                active ? "text-[var(--color-accent)]" : "text-[var(--color-text-tertiary)]"
              }`}>
              <Icon active={active} />
              {label}
            </AppLink>
          );
        })}
        <div className="flex flex-1 flex-col items-center gap-0.5 py-2.5"><ThemeToggle /></div>
        <div className="flex flex-1 flex-col items-center gap-0.5 py-2.5"><UserButton afterSignOutUrl="/" /></div>
      </nav>
    </div>
  );
}

/* ── Nav Icons ──────────────────────────────────────── */

function StudyIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function CardIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" /><path d="M12 17v4" />
    </svg>
  );
}

function DeckIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 6H3v13a2 2 0 0 0 2 2h11z" />
      <path d="M8 3h13v13a2 2 0 0 1-2 2H8z" />
    </svg>
  );
}

function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}
