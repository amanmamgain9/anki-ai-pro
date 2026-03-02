"use client";

import { anyApi } from "convex/server";
import { useQuery } from "convex/react";
import { useI18n } from "@/i18n/client";
import { useAppRouter, AppLink } from "@/lib/app-router";

const api = anyApi;

type SessionMeta = {
  _id: string;
  updatedAt: number;
  title: string;
  cardCount: number;
};

function formatSessionTime(ts: number, zh: boolean) {
  const deltaMs = Math.max(0, Date.now() - ts);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (deltaMs < minute) return zh ? "刚刚" : "just now";
  if (deltaMs < hour) {
    const n = Math.floor(deltaMs / minute);
    return zh ? `${n} 分钟前` : `${n}m ago`;
  }
  if (deltaMs < day) {
    const n = Math.floor(deltaMs / hour);
    return zh ? `${n} 小时前` : `${n}h ago`;
  }
  const n = Math.floor(deltaMs / day);
  return zh ? `${n} 天前` : `${n}d ago`;
}

export default function GenerateChatsSidebar() {
  const { locale } = useI18n();
  const { searchParams, navigate, back } = useAppRouter();
  const zh = locale === "zh";
  const sessions = (useQuery(api.chats.listActive) as SessionMeta[] | undefined) ?? [];

  const activeId = searchParams.get("chat");
  const hasItems = sessions.length > 0;
  const list = sessions.slice(0, 40);

  return (
    <aside className="hidden h-full min-h-0 w-64 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4 lg:flex lg:flex-col">
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) back();
          else navigate("/cards");
        }}
        className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-2.5 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
      >
        <span aria-hidden>←</span>
        {zh ? "返回" : "Back"}
      </button>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-[var(--color-text)]">
          {zh ? "历史草稿" : "Draft Chats"}
        </p>
        <button
          type="button"
          onClick={() => navigate("/cards/generate?new=1")}
          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[0.68rem] font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
        >
          {zh ? "新建" : "New"}
        </button>
      </div>

      {!hasItems ? (
        <p className="text-xs text-[var(--color-text-tertiary)]">
          {zh ? "还没有历史草稿。" : "No draft chats yet."}
        </p>
      ) : (
        <div className="ios-scroll min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {list.map((session) => {
            const title = session.title?.trim() || (zh ? "未命名主题" : "Untitled");
            const active = activeId === String(session._id);
            return (
              <AppLink
                key={String(session._id)}
                href={`/cards/generate?chat=${encodeURIComponent(String(session._id))}`}
                className={`block rounded-lg border px-2.5 py-2 transition ${
                  active
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
                }`}
              >
                <p className="truncate text-xs font-semibold text-[var(--color-text)]">
                  {title}
                </p>
                <p className="mt-1 text-[0.65rem] text-[var(--color-text-tertiary)]">
                  {session.cardCount} {zh ? "张卡" : "cards"} •{" "}
                  {formatSessionTime(session.updatedAt, zh)}
                </p>
              </AppLink>
            );
          })}
        </div>
      )}
    </aside>
  );
}
