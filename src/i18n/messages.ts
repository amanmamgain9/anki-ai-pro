export const supportedLocales = ["en", "zh"] as const;

export type Locale = (typeof supportedLocales)[number];

export function normalizeLocale(value?: string | null): Locale {
  if (!value) return "en";
  const lower = value.toLowerCase();
  if (lower.startsWith("zh")) return "zh";
  return "en";
}

export const dictionaries = {
  en: {
    common: {
      appName: "ANKI CARDS",
      signIn: "Sign in",
      getStarted: "Get started",
      pricing: "Pricing",
      about: "About",
      terms: "Terms",
      privacy: "Privacy",
      refundPolicy: "Refund Policy",
      createAccount: "Create account",
      continueWithGoogle: "Continue with Google",
    },
    locale: {
      switchLabel: "Switch language",
      toggleShort: "中文",
      english: "English",
      chinese: "Chinese",
    },
    marketing: {
      home: {
        badge: "Open-source study tool",
        titleTop: "Study smarter with",
        titleHighlight: "Markdown cards.",
        desc: "Create richly formatted flashcards, render diagrams inline, and sync changes in real time across all your devices.",
        getStartedFree: "Get started free",
        learnMore: "Learn more",
        openApp: "Open app",
        openCards: "Open your cards",
        features: [
          {
            title: "Markdown-first",
            desc: "Headings, code blocks, tables, and checklists. Your content stays portable.",
          },
          {
            title: "Mermaid diagrams",
            desc: "Flowcharts, sequence diagrams, and architecture sketches inline.",
          },
          {
            title: "Real-time sync",
            desc: "Convex pushes changes over WebSockets. Edits appear instantly everywhere.",
          },
        ],
      },
      about: {
        title: "Designed for",
        titleHighlight: "serious study",
        intro:
          "Anki Flashcards helps you build recall with structured Markdown notes, diagrams, and real-time collaboration.",
        whyTitle: "Why Markdown?",
        whyBody:
          "Markdown keeps your content portable and fast to edit. Pair it with Mermaid and you get visual context right where you need it, without leaving your study flow.",
        realtimeTitle: "Real-time by default",
        realtimeBody:
          "Convex provides WebSocket-based reactivity. Edit a card on your laptop and see the change on your phone instantly.",
        backHome: "Back home",
      },
      pricing: {
        title: "Simple",
        titleHighlight: "pricing",
        subtitle: "Start free. Upgrade when you're ready.",
        perMonth: "/mo",
        tiers: {
          free: {
            name: "Free",
            price: "$0",
            desc: "Everything you need to start studying.",
            features: [
              "Unlimited cards",
              "Markdown + Mermaid",
              "Real-time sync",
              "Deck management",
            ],
            cta: "Get started",
          },
          pro: {
            name: "Pro",
            price: "$8",
            desc: "Advanced tools for power users.",
            features: [
              "Everything in Free",
              "AI-generated cards",
              "Import / export",
              "Priority support",
            ],
            cta: "Coming soon",
          },
        },
      },
      legal: {
        pricingCta: "Pricing",
        lastUpdated: "Last updated: February 25, 2026",
      },
    },
    auth: {
      signInTitle: "Sign in",
      signInDesc: "Continue with Google to access your cards.",
      signUpTitle: "Create account",
      signUpDesc: "Use Google to create your account and sync your study data.",
    },
    app: {
      loadingAccount: "Loading your account...",
      redirectingSignIn: "Redirecting to sign in...",
      account: "Account",
      signOut: "Sign out",
      nav: {
        study: "Study",
        cards: "Cards",
        generate: "Generate",
        decks: "Decks",
        settings: "Settings",
      },
      cards: {
        title: "Cards",
        loading: "Loading...",
        allDecks: "All decks",
        study: "Study",
        seedSamples: "Seed samples",
        generateAi: "Generate AI",
        bulkUpload: "Bulk upload",
        newCard: "New card",
        noCards: "No cards yet",
        noCardsDesc: "Create your first flashcard or seed some samples to get started.",
        createCard: "Create card",
        showFront: "Show front",
        flipToBack: "Flip to back",
        edit: "Edit",
        delete: "Delete",
        noDeck: "No deck",
        unknownDeck: "Unknown deck",
        untitled: "Untitled",
      },
      generate: {
        title: "Generate with AI",
        subtitle: "Type topic, choose level, and save cards in one flow.",
      },
    },
  },
  zh: {
    common: {
      appName: "ANKI CARDS",
      signIn: "登录",
      getStarted: "开始使用",
      pricing: "定价",
      about: "关于",
      terms: "服务条款",
      privacy: "隐私政策",
      refundPolicy: "退款政策",
      createAccount: "创建账户",
      continueWithGoogle: "使用 Google 继续",
    },
    locale: {
      switchLabel: "切换语言",
      toggleShort: "EN",
      english: "英文",
      chinese: "中文",
    },
    marketing: {
      home: {
        badge: "开源学习工具",
        titleTop: "用以下方式更高效学习",
        titleHighlight: "Markdown 卡片",
        desc: "创建高质量格式化闪卡，内联渲染图表，并在所有设备间实时同步。",
        getStartedFree: "免费开始",
        learnMore: "了解更多",
        openApp: "打开应用",
        openCards: "打开我的卡片",
        features: [
          {
            title: "Markdown 优先",
            desc: "支持标题、代码块、表格与清单，你的内容始终可迁移。",
          },
          {
            title: "Mermaid 图表",
            desc: "可直接写流程图、时序图和架构图，不用离开编辑器。",
          },
          {
            title: "实时同步",
            desc: "Convex 通过 WebSocket 推送更新，修改会立刻同步到所有设备。",
          },
        ],
      },
      about: {
        title: "为",
        titleHighlight: "深度学习者",
        intro: "Anki Flashcards 帮你用结构化 Markdown、图表与实时协作提升记忆效果。",
        whyTitle: "为什么是 Markdown？",
        whyBody:
          "Markdown 让内容更易编辑且可移植。结合 Mermaid，你可以在学习流程中直接加入可视化内容。",
        realtimeTitle: "默认实时",
        realtimeBody:
          "Convex 提供基于 WebSocket 的响应式能力。你在电脑改卡片，手机会立即看到变化。",
        backHome: "返回首页",
      },
      pricing: {
        title: "简单",
        titleHighlight: "定价",
        subtitle: "免费开始，需要时再升级。",
        perMonth: "/月",
        tiers: {
          free: {
            name: "免费版",
            price: "$0",
            desc: "满足入门学习所需的全部功能。",
            features: ["无限卡片", "Markdown + Mermaid", "实时同步", "牌组管理"],
            cta: "开始使用",
          },
          pro: {
            name: "专业版",
            price: "$8",
            desc: "为重度用户提供高级能力。",
            features: ["含免费版全部功能", "AI 生成卡片", "导入 / 导出", "优先支持"],
            cta: "即将推出",
          },
        },
      },
      legal: {
        pricingCta: "定价",
        lastUpdated: "最后更新：2026 年 2 月 25 日",
      },
    },
    auth: {
      signInTitle: "登录",
      signInDesc: "使用 Google 登录以访问你的卡片。",
      signUpTitle: "创建账户",
      signUpDesc: "使用 Google 创建账户并同步你的学习数据。",
    },
    app: {
      loadingAccount: "正在加载你的账户...",
      redirectingSignIn: "正在跳转到登录页...",
      account: "账户",
      signOut: "退出登录",
      nav: {
        study: "学习",
        cards: "卡片",
        generate: "AI 生成",
        decks: "牌组",
        settings: "设置",
      },
      cards: {
        title: "卡片",
        loading: "加载中...",
        allDecks: "全部牌组",
        study: "学习",
        seedSamples: "填充示例",
        generateAi: "AI 生成",
        bulkUpload: "批量导入",
        newCard: "新建卡片",
        noCards: "还没有卡片",
        noCardsDesc: "先创建第一张闪卡，或导入示例数据开始。",
        createCard: "创建卡片",
        showFront: "显示正面",
        flipToBack: "翻到背面",
        edit: "编辑",
        delete: "删除",
        noDeck: "无牌组",
        unknownDeck: "未知牌组",
        untitled: "未命名",
      },
      generate: {
        title: "AI 生成卡片",
        subtitle: "输入主题，选择水平，一步生成并保存。",
      },
    },
  },
} as const;

export type Dictionary = (typeof dictionaries)[Locale];
