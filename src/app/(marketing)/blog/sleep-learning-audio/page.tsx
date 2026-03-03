import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import BrandLogo from "@/components/BrandLogo";
import MarketingFooter from "@/components/MarketingFooter";
import { getServerDictionary } from "@/i18n/server";

export const metadata: Metadata = {
  title: "Sleep Learning with Audio | Anki Cards Blog",
  description:
    "A bedtime workflow to replace doom scrolling with voice-first flashcard learning while reducing blue-light exposure.",
};

export default async function SleepLearningAudioBlogPage() {
  const { locale } = await getServerDictionary();
  const zh = locale === "zh";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <BrandLogo iconSize={28} />
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          <Link href="/sign-in" className="btn-primary">
            {zh ? "开始使用" : "Get Started"}
          </Link>
        </div>
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
              ? "我如何在睡前用 AnkiPro 音频学习，替代刷屏"
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
              {zh ? "我做的改变：改成 AnkiPro 音频复习" : "What I changed with AnkiPro audio mode"}
            </h2>
            <p className="mt-2">
              {zh
                ? "现在我把手机亮度调到最低，打开 AnkiPro 的语音模式。系统读卡片正面，我直接口头回答，然后听背面和解释。很多时候我几乎不用盯屏幕。"
                : "Now I dim my phone, open voice mode, and let AnkiPro quiz me while I’m already in bed. It reads the front, I answer out loud, and then I hear the back plus a quick explanation. I’ve been using it for Spanish phrases, and it honestly feels like a tiny bedtime tutor session instead of random scrolling."}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--color-text)] sm:text-xl">
              {zh ? "我现在的 10-20 分钟流程" : "My real bedtime flow (about 15 minutes)"}
            </h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>{zh ? "打开语音模式，选一个牌组开始。" : "I start one deck, usually Spanish travel or daily conversation cards."}</li>
              <li>{zh ? "系统读题，我直接回答；不会就说“解释一下”。" : "I answer out loud. If I blank, I just say “explain this card more.”"}</li>
              <li>{zh ? "系统会给出记忆评分建议，我通常一键确认。" : "I take the suggested rating and keep moving so the session stays light."}</li>
              <li>{zh ? "结束前看一眼热力图，然后收手机睡觉。" : "I end on a small win, check the heatmap, and put the phone away."}</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--color-text)] sm:text-xl">
              {zh ? "为什么我能坚持下来" : "What changed after a couple of weeks"}
            </h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>{zh ? "门槛很低：我不用坐起来，也不用打字。" : "I actually remember phrases I used to forget by morning."}</li>
              <li>{zh ? "每张卡都有反馈，我能感觉到自己在推进。" : "My nights feel calmer because I’m not feeding my brain endless random content."}</li>
              <li>{zh ? "屏幕使用更少，睡前状态明显更平静。" : "It feels fun, not forced, because I can do it half-relaxed in bed."}</li>
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
