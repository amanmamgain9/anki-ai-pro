"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import UserSync from "@/components/UserSync";
import { AppRouterProvider, AppLink, useAppRouter } from "@/lib/app-router";
import { useI18n } from "@/i18n/client";

const navItems = [
  { href: "/study", labelKey: "app.nav.study", icon: StudyIcon },
  { href: "/cards", labelKey: "app.nav.cards", icon: CardIcon },
  { href: "/cards/generate", labelKey: "app.nav.generate", icon: GenerateIcon },
  { href: "/decks", labelKey: "app.nav.decks", icon: DeckIcon },
  { href: "/settings", labelKey: "app.nav.settings", icon: SettingsIcon },
];

function isActiveRoute(pathname: string, href: string) {
  if (href === "/cards") {
    return (
      pathname === "/cards" ||
      pathname.startsWith("/cards?") ||
      pathname === "/cards/new" ||
      pathname.startsWith("/cards/new?") ||
      pathname === "/cards/bulk" ||
      pathname.startsWith("/cards/bulk?")
    );
  }
  return pathname === href || pathname.startsWith(`${href}?`);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const initialPath = usePathname();
  const router = useRouter();
  const { status } = useSession();
  const { t } = useI18n();

  useEffect(() => {
    if (status !== "unauthenticated") return;
    const callbackUrl = initialPath || "/cards";
    router.replace(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }, [initialPath, router, status]);

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t("app.loadingAccount")}
        </p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t("app.redirectingSignIn")}
        </p>
      </div>
    );
  }

  return (
    <AppRouterProvider initialPath={initialPath}>
      <UserSync />
      <AppShell>{children}</AppShell>
    </AppRouterProvider>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useAppRouter();
  const { t } = useI18n();

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:gap-6 lg:border-r lg:border-[var(--color-border)] lg:bg-[var(--color-surface)] lg:p-5">
        <AppLink href="/cards" className="gradient-text text-lg font-bold tracking-tight">
          ANKI CARDS
        </AppLink>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map(({ href, labelKey, icon: Icon }) => {
            const active = isActiveRoute(pathname, href);
            return (
              <AppLink key={href} href={href}
                className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                  active ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
                }`}
                style={active ? { boxShadow: "inset 3px 0 0 var(--color-accent)" } : undefined}>
                <Icon active={active} />
                {t(labelKey)}
              </AppLink>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 border-t border-[var(--color-border)] pt-5">
          <AccountButton compact />
          <span className="flex-1 text-xs text-[var(--color-text-tertiary)]">{t("app.account")}</span>
          <LocaleSwitcher />
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
        {navItems.map(({ href, labelKey, icon: Icon }) => {
          const active = isActiveRoute(pathname, href);
          return (
            <AppLink key={href} href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[0.625rem] font-bold uppercase tracking-wider transition ${
                active ? "text-[var(--color-accent)]" : "text-[var(--color-text-tertiary)]"
              }`}>
              <Icon active={active} />
              {t(labelKey)}
            </AppLink>
          );
        })}
        <div className="flex flex-1 flex-col items-center gap-0.5 py-2.5"><LocaleSwitcher /></div>
        <div className="flex flex-1 flex-col items-center gap-0.5 py-2.5"><ThemeToggle /></div>
        <div className="flex flex-1 flex-col items-center gap-0.5 py-2.5"><AccountButton /></div>
      </nav>
    </div>
  );
}

function AccountButton({ compact = false }: { compact?: boolean }) {
  const { data: session } = useSession();
  const { t } = useI18n();
  const label = session?.user?.name?.trim()?.charAt(0).toUpperCase() ?? "U";

  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className={`flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] font-bold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] ${compact ? "h-8 w-8 text-xs" : "h-8 w-8 text-[0.65rem]"}`}
      title={session?.user?.email ?? t("app.signOut")}
      aria-label={t("app.signOut")}
    >
      {label}
    </button>
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

function GenerateIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l1.4 3.8L17 8.2l-3.6 1.4L12 13.5l-1.4-3.9L7 8.2l3.6-1.4L12 3z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
      <path d="M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14z" />
    </svg>
  );
}
