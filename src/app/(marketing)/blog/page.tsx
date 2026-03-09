import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import BrandLogo from "@/components/BrandLogo";
import MarketingFooter from "@/components/MarketingFooter";
import MarketingHeaderLinks from "@/components/MarketingHeaderLinks";
import { getServerDictionary } from "@/i18n/server";

export const metadata: Metadata = {
  title: "Blog | Anki Cards",
  description: "Practical learning workflows and flashcard study guides.",
};

export default async function BlogIndexPage() {
  const { dict, locale } = await getServerDictionary();
  const zh = locale === "zh";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-6">
          <BrandLogo iconSize={28} />
          <MarketingHeaderLinks
            aboutLabel={dict.common.about}
            pricingLabel={dict.common.pricing}
            contactLabel={dict.common.contact}
            className="hidden items-center gap-5 md:flex"
          />
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          <Link href="/sign-in" className="btn-primary">
            {dict.common.getStarted}
          </Link>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-12 sm:px-6 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-accent)]">
          {zh ? "博客" : "Blog"}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {zh ? "学习系统设计与实战" : "Learning Systems, Built for Real Life"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
          {zh
            ? "关于如何把碎片时间变成稳定学习习惯。"
            : "Practical ideas for turning scattered screen time into consistent learning progress."}
        </p>

        <div className="mt-10 border-y border-[var(--color-border)]">
          <article className="py-7">
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
              <span>{zh ? "2026-03-02" : "March 2, 2026"}</span>
              <span aria-hidden>•</span>
              <span>{zh ? "用户故事" : "User story"}</span>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">
              {zh
                ? "我如何在睡前用 AnkiPro 音频学习，替代刷屏"
                : "I Started Learning in Bed Instead of Doom Scrolling"}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-[var(--color-text-secondary)]">
              {zh
                ? "一个真实夜间学习故事：把“再刷十分钟”换成“再复习十分钟”，结果是更稳定的学习与更平静的睡前状态。"
                : "A first-person story about replacing late-night scrolling with audio flashcard sessions and how that changed my sleep and consistency."}
            </p>
            <Link href="/blog/sleep-learning-audio" className="mt-4 inline-flex text-sm font-semibold text-[var(--color-accent)] hover:underline">
              {zh ? "阅读全文 →" : "Read full story →"}
            </Link>
          </article>
        </div>
      </section>

      <MarketingFooter locale={locale} />
    </div>
  );
}
