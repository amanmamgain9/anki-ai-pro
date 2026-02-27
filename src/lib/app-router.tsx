"use client";

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
  type MouseEvent,
  type AnchorHTMLAttributes,
} from "react";

type RouterCtx = {
  pathname: string;
  searchParams: URLSearchParams;
  navigate: (to: string) => void;
  replace: (to: string) => void;
  back: () => void;
};

const Ctx = createContext<RouterCtx>({
  pathname: "/cards",
  searchParams: new URLSearchParams(),
  navigate: () => {},
  replace: () => {},
  back: () => {},
});

// ── URL store (module-level, singleton) ────────────

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("popstate", cb);
  };
}

function getSnapshot() {
  return window.location.pathname + window.location.search;
}

function navigate(to: string) {
  history.pushState(null, "", to);
  listeners.forEach((fn) => fn());
}

function replace(to: string) {
  history.replaceState(null, "", to);
  listeners.forEach((fn) => fn());
}

function back() {
  history.back();
}

// ── Provider ───────────────────────────────────────

export function AppRouterProvider({
  children,
  initialPath,
}: {
  children: ReactNode;
  initialPath?: string;
}) {
  const url = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => initialPath ?? "/cards",
  );

  const qIdx = url.indexOf("?");
  const pathname = qIdx >= 0 ? url.slice(0, qIdx) : url;
  const search = qIdx >= 0 ? url.slice(qIdx) : "";

  return (
    <Ctx.Provider
      value={{
        pathname,
        searchParams: new URLSearchParams(search),
        navigate,
        replace,
        back,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAppRouter() {
  return useContext(Ctx);
}

// ── Link ───────────────────────────────────────────

type AppLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
};

export function AppLink({ href, children, onClick, ...rest }: AppLinkProps) {
  function handle(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onClick?.(e);
    navigate(href);
  }

  return (
    <a href={href} onClick={handle} {...rest}>
      {children}
    </a>
  );
}
