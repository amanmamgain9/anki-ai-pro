"use client";

import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import GenerateChatsSidebar from "@/components/GenerateChatsSidebar";
import { AppRouterProvider, AppLink, useAppRouter } from "@/lib/app-router";
import { useI18n } from "@/i18n/client";
import CardsView from "@/views/CardsView";
import NewCardView from "@/views/NewCardView";
import DecksView from "@/views/DecksView";
import NewDeckView from "@/views/NewDeckView";
import StudyView from "@/views/StudyView";
import BulkUploadView from "@/views/BulkUploadView";
import SettingsView from "@/views/SettingsView";
import GenerateCardsView from "@/views/GenerateCardsView";
import BillingStartView from "@/views/BillingStartView";
import { recoverPendingCheckoutCompletion } from "@/lib/paddle-checkout-client";

const api = anyApi;

const navItems = [
  { href: "/study", labelKey: "app.nav.study", icon: StudyIcon },
  { href: "/cards", labelKey: "app.nav.cards", icon: CardIcon },
  { href: "/cards/generate", labelKey: "app.nav.generate", icon: GenerateIcon },
  { href: "/decks", labelKey: "app.nav.decks", icon: DeckIcon },
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

export default function AppPageClient({
  initialPath,
  showUpgradeCta,
}: {
  initialPath: string;
  showUpgradeCta: boolean;
}) {
  return (
    <AppRouterProvider initialPath={initialPath}>
      <AppShell showUpgradeCta={showUpgradeCta}>
        <AppRouteContent />
      </AppShell>
    </AppRouterProvider>
  );
}

function AppRouteContent() {
  const { pathname } = useAppRouter();

  if (pathname === "/cards/bulk" || pathname.startsWith("/cards/bulk?")) return <BulkUploadView />;
  if (pathname === "/cards/generate" || pathname.startsWith("/cards/generate?")) return <GenerateCardsView />;
  if (pathname === "/cards/new" || pathname.startsWith("/cards/new?")) return <NewCardView />;
  if (pathname === "/decks/new" || pathname.startsWith("/decks/new?")) return <NewDeckView />;
  if (pathname === "/study" || pathname.startsWith("/study?")) {
    const deckKey = new URLSearchParams(window.location.search).get("deck") || "picker";
    return <StudyView key={deckKey} />;
  }
  if (pathname === "/decks" || pathname.startsWith("/decks?")) return <DecksView />;
  if (pathname === "/start-trial" || pathname.startsWith("/start-trial?")) return <BillingStartView />;
  if (pathname === "/settings") return <SettingsView />;

  return <CardsView />;
}

function AppShell({
  children,
  showUpgradeCta,
}: {
  children: React.ReactNode;
  showUpgradeCta: boolean;
}) {
  const { pathname, searchParams, back, navigate, replace } = useAppRouter();
  const { t } = useI18n();
  const billing = useQuery(api.billing.getMyBilling) as
    | { isActive?: boolean; checkoutPendingConfirmation?: boolean }
    | undefined;
  const isGenerateFocusRoute =
    pathname === "/cards/generate" || pathname.startsWith("/cards/generate?");
  const isBillingStartRoute =
    pathname === "/start-trial" || pathname.startsWith("/start-trial?");
  const isSettingsRoute = pathname === "/settings" || pathname.startsWith("/settings?");
  const isStudyRoute = pathname === "/study" || pathname.startsWith("/study?");
  const isFocusRoute = isGenerateFocusRoute || isBillingStartRoute;
  const currentPath = searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname;
  const checkoutRecoveryAttemptedRef = useRef(false);
  const billingSuccess = searchParams.get("billing") === "success";
  const hasCheckoutCompletionContext = Boolean(
    searchParams.get("checkoutSessionId") && searchParams.get("transactionId"),
  );
  const canStayOnSettingsDuringCheckoutConfirmation =
    isSettingsRoute &&
    (Boolean(billing?.checkoutPendingConfirmation) ||
      (billingSuccess &&
        hasCheckoutCompletionContext &&
        billing?.isActive === false &&
        !billing?.checkoutPendingConfirmation));

  useEffect(() => {
    if (checkoutRecoveryAttemptedRef.current) return;
    checkoutRecoveryAttemptedRef.current = true;
    void (async () => {
      const recovered = await recoverPendingCheckoutCompletion();
      if (recovered) {
        window.location.reload();
      }
    })();
  }, []);

  useEffect(() => {
    if (billing?.isActive !== false) return;
    if (isBillingStartRoute) return;
    if (canStayOnSettingsDuringCheckoutConfirmation) return;
    replace(`/start-trial?from=${encodeURIComponent(currentPath)}`);
  }, [
    billing?.isActive,
    canStayOnSettingsDuringCheckoutConfirmation,
    currentPath,
    isBillingStartRoute,
    replace,
  ]);

  return (
    <div className="flex h-dvh overflow-hidden flex-col lg:flex-row">
      {!isFocusRoute && (
        <aside
          className="relative hidden h-full min-h-0 overflow-hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:gap-6 lg:border-r lg:border-[var(--color-border)] lg:p-5"
          style={{
            background:
              "radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--color-accent) 16%, transparent), transparent 58%), radial-gradient(120% 90% at 100% 100%, color-mix(in oklab, var(--color-accent) 10%, transparent), transparent 62%), var(--color-surface)",
          }}
        >
          <div className="pointer-events-none absolute -left-16 -top-24 h-44 w-44 rounded-full bg-[var(--color-accent-soft)] blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 right-0 h-40 w-40 rounded-full bg-[var(--color-surface-alt)] blur-3xl" />

          <AppLink href="/cards" className="relative z-10 inline-flex items-center gap-2.5">
            <Image
              src="/brand/logo-mark-512.png"
              alt="aiankipro logo"
              width={26}
              height={26}
              className="h-auto w-auto rounded-[20%]"
              priority
            />
            <span className="gradient-text text-lg font-bold tracking-tight">aiankipro</span>
          </AppLink>

          {isStudyRoute && (
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) back();
                else navigate("/decks");
              }}
              className="relative z-10 flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
            >
              <span aria-hidden>←</span>
              {t("app.back")}
            </button>
          )}

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

          <div className="relative z-10 border-t border-[var(--color-border)] pt-4">
            <UserMenu showUpgradeCta={showUpgradeCta} />
          </div>
        </aside>
      )}
      {isGenerateFocusRoute && <GenerateChatsSidebar />}

      {!isBillingStartRoute && (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 lg:hidden">
          <div className="flex min-w-[72px] items-center">
            {(isStudyRoute || isGenerateFocusRoute) && (
              <button
                type="button"
                onClick={() => {
                  if (window.history.length > 1) back();
                  else navigate("/cards");
                }}
                className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
              >
                <span aria-hidden>← </span>
                {t("app.back")}
              </button>
            )}
          </div>
          <div className="ml-auto inline-flex items-center gap-2">
            <ThemeToggle className="scale-75 origin-center" />
            <AppLink href="/cards" className="inline-flex items-center gap-2">
              <Image
                src="/brand/logo-mark-512.png"
                alt="aiankipro logo"
                width={24}
                height={24}
                className="h-auto w-auto rounded-[20%]"
                priority
              />
              <span className="gradient-text text-sm font-bold tracking-tight">aiankipro</span>
            </AppLink>
          </div>
        </header>
      )}

      <main
        className={`ios-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto [padding-bottom:env(safe-area-inset-bottom)] ${
          isFocusRoute ? "pb-0" : "pb-20 lg:pb-0"
        }`}
      >
        <div className={`${isGenerateFocusRoute ? "mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10" : isBillingStartRoute ? "mx-auto max-w-5xl px-4 py-0 sm:px-6 lg:px-8 lg:py-0" : "mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10"}`}>
          {children}
        </div>
      </main>

      {!isFocusRoute && (
        <nav className="fixed inset-x-0 bottom-0 z-50 flex items-center border-t border-[var(--color-border)] bg-[var(--color-surface)] backdrop-blur-xl lg:hidden">
          {navItems.map(({ href, labelKey, icon: Icon }) => {
            const active = isActiveRoute(pathname, href);
            return (
              <AppLink
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[0.625rem] font-bold uppercase tracking-wider transition ${
                  active ? "text-[var(--color-accent)]" : "text-[var(--color-text-tertiary)]"
                }`}
              >
                <Icon active={active} />
                {t(labelKey)}
              </AppLink>
            );
          })}
          <div className="relative flex flex-1 flex-col items-center gap-0.5 py-2.5">
            <UserMenu showUpgradeCta={showUpgradeCta} mobile />
          </div>
        </nav>
      )}
    </div>
  );
}

function UserMenu({
  showUpgradeCta,
  mobile = false,
}: {
  showUpgradeCta: boolean;
  mobile?: boolean;
}) {
  const { data: session } = useSession();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const label = session?.user?.name?.trim()?.charAt(0).toUpperCase() ?? "U";
  const name = session?.user?.name?.trim() || t("app.account");

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={mobile ? "w-full" : "relative"}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          mobile
            ? "flex w-full flex-col items-center gap-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] transition hover:text-[var(--color-text)]"
            : "flex w-full items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-2.5 py-2 text-left text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
        }
        aria-label={t("app.account")}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold">
          {label}
        </span>
        {!mobile && (
          <>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{name}</span>
            <span className="text-[0.65rem]">▾</span>
          </>
        )}
        {mobile && <span>{t("app.account")}</span>}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-[120] mb-2 w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-2xl">
          <div className="px-2 py-1.5">
            <p className="truncate text-xs font-semibold text-[var(--color-text)]">{name}</p>
            <p className="truncate text-[0.7rem] text-[var(--color-text-tertiary)]">
              {session?.user?.email ?? ""}
            </p>
          </div>
          <div className="my-1 h-px bg-[var(--color-border)]" />

          <AppLink
            href="/settings"
            onClick={() => setOpen(false)}
            className="block rounded-md px-2 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
          >
            {t("app.nav.settings")}
          </AppLink>
          {showUpgradeCta && (
            <AppLink
              href="/start-trial"
              onClick={() => setOpen(false)}
              className="block rounded-md px-2 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
            >
              {t("app.upgradeCta")}
            </AppLink>
          )}

          <div className="my-1 h-px bg-[var(--color-border)]" />
          <div className="flex items-center justify-between rounded-md px-2 py-1.5">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut({ callbackUrl: "/" });
            }}
            className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
          >
            {t("app.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

function StudyIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function CardIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 9h6M7 13h10" />
    </svg>
  );
}

function GenerateIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.8 4.8L19 9.6l-5.2 1.8L12 16.2l-1.8-4.8L5 9.6l5.2-1.8L12 3z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
    </svg>
  );
}

function DeckIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M6 12h12M8 17h8" />
    </svg>
  );
}
