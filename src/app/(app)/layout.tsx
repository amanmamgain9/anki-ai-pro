"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import UserSync from "@/components/UserSync";
import GenerateChatsSidebar from "@/components/GenerateChatsSidebar";
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
    const callbackUrl =
      !initialPath || initialPath === "/cards"
        ? "/cards/generate"
        : initialPath;
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
  const isGenerateFocusRoute =
    pathname === "/cards/generate" || pathname.startsWith("/cards/generate?");

  return (
    <div className="flex h-dvh overflow-hidden flex-col lg:flex-row">
      {/* Desktop sidebar */}
      {!isGenerateFocusRoute && (
        <aside
          className="relative hidden h-full min-h-0 overflow-hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:gap-6 lg:border-r lg:border-[var(--color-border)] lg:p-5"
          style={{
            background:
              "radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--color-accent) 16%, transparent), transparent 58%), radial-gradient(120% 90% at 100% 100%, color-mix(in oklab, var(--color-accent) 10%, transparent), transparent 62%), var(--color-surface)",
          }}
        >
          <div className="pointer-events-none absolute -left-16 -top-24 h-44 w-44 rounded-full bg-[var(--color-accent-soft)] blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 right-0 h-40 w-40 rounded-full bg-[var(--color-surface-alt)] blur-3xl" />

          <AppLink href="/cards" className="gradient-text relative z-10 text-lg font-bold tracking-tight">
            ANKI CARDS
          </AppLink>

          <nav className="ios-scroll relative z-10 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
            {navItems.map(({ href, labelKey, icon: Icon }) => {
              const active = isActiveRoute(pathname, href);
              return (
                <AppLink
                  key={href}
                  href={href}
                  className={`group flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-all duration-200 ${
                    active
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                      : "border-transparent text-[var(--color-text-secondary)] hover:-translate-y-[1px] hover:border-[var(--color-border)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
                  }`}
                  style={
                    active
                      ? {
                          boxShadow:
                            "inset 2px 0 0 var(--color-accent), 0 10px 26px color-mix(in oklab, var(--color-accent) 16%, transparent)",
                        }
                      : undefined
                  }
                >
                  <Icon active={active} />
                  {t(labelKey)}
                </AppLink>
              );
            })}
          </nav>

          <div className="relative z-10 flex items-center gap-2 border-t border-[var(--color-border)] pt-5">
            <AccountButton compact />
            <span className="flex-1 text-xs text-[var(--color-text-tertiary)]">{t("app.account")}</span>
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </aside>
      )}
      {isGenerateFocusRoute && <GenerateChatsSidebar />}

      {/* Main content */}
      <main
        className={`ios-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto [padding-bottom:env(safe-area-inset-bottom)] ${
          isGenerateFocusRoute ? "pb-0" : "pb-20 lg:pb-0"
        }`}
      >
        <div className={`${isGenerateFocusRoute ? "mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10" : "mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10"}`}>
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      {!isGenerateFocusRoute && (
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
      )}
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
