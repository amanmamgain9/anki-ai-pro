import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import BrandLogo from "@/components/BrandLogo";
import MarketingFooter from "@/components/MarketingFooter";
import MarketingHeaderLinks from "@/components/MarketingHeaderLinks";
import { getServerDictionary } from "@/i18n/server";

export const metadata: Metadata = {
  title: "Sleep Learning with Audio | AIANKIPRO Blog",
  description:
    "A bedtime workflow to replace doom scrolling with voice-first card review: Learn mode first, then Shuffle mode for recall.",
};

export default async function SleepLearningAudioBlogPage() {
  const { dict, locale } = await getServerDictionary();
  const zh = locale === "zh";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <BrandLogo iconSize={28} />
          <MarketingHeaderLinks
            aboutLabel={dict.common.about}
            pricingLabel={dict.common.pricing}
            contactLabel={dict.common.contact}
            className="hidden items-center justify-center gap-6 md:flex"
          />
          <div className="flex items-center gap-2 justify-self-end">
          <LocaleSwitcher />
          <ThemeToggle />
          <Link href="/sign-in" className="btn-primary">
            {dict.common.getStarted}
          </Link>
          </div>
        </div>
        <MarketingHeaderLinks
          aboutLabel={dict.common.about}
          pricingLabel={dict.common.pricing}
          contactLabel={dict.common.contact}
          className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 md:hidden"
        />
      </header>

      <article className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <Link href="/blog" className="text-xs font-semibold text-[var(--color-accent)] hover:underline">
          {zh ? "← 返回博客" : "← Back to blog"}
        </Link>
        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-accent)]">
            {zh ? "用户故事" : "User Story"}
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {zh
              ? "我如何在睡前用 AIANKIPRO 语音学习，替代刷屏"
              : "I Started Learning in Bed Instead of Doom Scrolling"}
          </h1>
          <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
            {zh ? "发布于 2026-03-02" : "Published on March 2, 2026"}
          </p>

          <div className="mt-8 h-px bg-[var(--color-border)]" />

          <div className="mt-8 space-y-6 text-base leading-8 text-[var(--color-text-secondary)]">
          <section>
            <h2 className="text-lg font-bold text-[var(--color-text)] sm:text-xl">
              {zh ? "我以前的夜晚：总是多刷 30 分钟" : "It used to be me, reels, and “just 5 more minutes”"}
            </h2>
            <p className="mt-2">
              {zh
                ? "我躺到床上以后，本来只想放松一下，但常常会刷短视频刷到很晚。最糟糕的是，越刷越清醒，蓝光刺激让我更难入睡。"
                : "My nights were predictable: open phone, watch one short video, then suddenly it’s 1:00 AM. I wasn’t resting, and I definitely wasn’t learning anything useful. The bright screen also kept my brain wired when I actually wanted to sleep."}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--color-text)] sm:text-xl">
              {zh ? "我做的改变：改成 AIANKIPRO 学习闭环" : "What I changed with AIANKIPRO's learning flow"}
            </h2>
            <p className="mt-2">
              {zh
                ? "现在我先用学习模式把新卡片顺一遍，睡前再用随机模式做回忆。语音模式会读卡片，我口头回答；如果卡住，就直接开卡片对话（也可以语音问）。这样我不用在多个 App 之间来回切。"
                : "Now I use a clearer loop: Learn mode first for new cards, then Shuffle mode at night for recall. In voice mode, the app reads the card and I answer out loud. If I get stuck, I open card chat (or ask by voice) and keep going in the same flow instead of context-switching across apps."}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--color-text)] sm:text-xl">
              {zh ? "我现在的 10-20 分钟流程" : "My real bedtime flow (about 15 minutes)"}
            </h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>{zh ? "白天有新内容时，先用学习模式顺序走一遍。" : "If I added new cards that day, I do a quick Learn mode pass first."}</li>
              <li>{zh ? "睡前切到随机模式，开语音，让系统读卡，我直接口头回答。" : "At bedtime, I switch to Shuffle mode with voice so the app reads and I answer out loud."}</li>
              <li>{zh ? "遇到不懂就开卡片对话；如果之前聊过，我会直接打开旧总结继续。" : "If a card is unclear, I open card chat. If I chatted before, I reopen the old summary and continue."}</li>
              <li>{zh ? "系统会给评分建议，我确认后再做几张，然后收手机睡觉。" : "The app can suggest a rating, I confirm, finish a few more cards, and stop."}</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--color-text)] sm:text-xl">
              {zh ? "为什么我能坚持下来" : "What changed after a couple of weeks"}
            </h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>{zh ? "流程更清楚：学习模式负责“学会”，随机模式负责“记住”。" : "The flow is clearer: Learn mode helps me understand, Shuffle mode checks what I can actually retrieve."}</li>
              <li>{zh ? "卡住时直接问，不用跳到别的地方找解释。" : "When I get stuck, help is right there through card chat or voice chat."}</li>
              <li>{zh ? "旧总结和历史对话都还在，不会每次都从头解释。" : "Old summaries and chat history stay attached to the card, so I don’t restart from zero."}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--color-text)] sm:text-xl">
              {zh ? "我的结论" : "My takeaway"}
            </h2>
            <p className="mt-2 font-medium text-[var(--color-text)]">
              {zh
                ? "我只是把“再刷十分钟”换成“再复习十分钟”，几周后就能明显感觉到知识留存和作息状态都更好了。"
                : "I didn’t become a different person. I just replaced one habit: 10 minutes of scrolling became 10 minutes of voice review. That tiny swap made nights better and learning more consistent."}
            </p>
          </section>
          </div>
        </div>
      </article>

      <MarketingFooter locale={locale} />
    </div>
  );
}
