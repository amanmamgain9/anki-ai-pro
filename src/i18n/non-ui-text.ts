export const generateChatKeywords = {
  beginnerLevel: ["beginner", "basic", "初"],
  intermediateLevel: ["intermediate", "medium", "中级"],
  advancedLevel: ["advanced", "hard", "高级"],
  cardCountUnits: /(\d{1,2})\s*(cards?|flashcards?|张)/i,
  generateIntent: /(generate|create|start|go|now|生成|开始|来吧|做吧)/i,
  regenerateIntent: /(regenerate|again|rebuild|new draft|from scratch|重新生成|重做|再来)/i,
  saveNowIntent: /(save now|commit|finali[sz]e|publish|提交|立即保存|保存到题库)/i,
  openEditorIntent: /(open editor|open draft|edit draft|打开编辑|编辑草稿|回到编辑)/i,
  countIntent: /(cards?|flashcards?|张)/i,
  autoDeckIntent: /(new deck|create deck|auto deck|新牌组|自动牌组)/i,
  existingDeckIntent: /(use deck|existing deck|save to|用牌组|现有牌组|保存到)/i,
} as const;

export const aiFallbackFeedback = {
  en: "I suggest 'Good' for this attempt. Say again/hard/good/easy to override.",
  zh: "我建议这次给“良好”。你可以说“重来/困难/良好/简单”来覆盖。",
} as const;

export const voiceCommandKeywords = {
  rateAgain: ["again", "forgot", "dont know", "don't know", "重来", "忘了", "不会"],
  rateHard: ["hard", "difficult", "困难", "吃力"],
  rateGood: ["good", "ok", "okay", "got it", "良好", "还行", "答对"],
  rateEasy: ["easy", "very easy", "simple", "简单", "秒答"],
  applySuggested: ["apply", "use that", "go with that", "采用", "就这个", "确认"],
  tutorPrefix: /^(ask tutor|tutor|open tutor|问导师|导师)\s*(.*)$/i,
  tutorExplain: [
    "explain this",
    "explain this card",
    "explain more",
    "more detail",
    "elaborate",
    "clarify",
    "give example",
    "解释一下",
    "详细讲",
    "讲详细",
    "举个例子",
  ],
  closeTutor: ["close tutor", "back to study", "退出导师", "关闭导师", "返回学习"],
  stopVoice: ["stop voice", "voice off", "stop listening", "关闭语音", "停止语音"],
  showFront: ["show front", "front side", "read front", "正面", "读正面"],
  showBack: ["show back", "read back", "背面", "读背面"],
  flip: ["flip", "turn card", "翻面"],
  nextCard: ["next", "next card", "下一个"],
  previousCard: ["previous", "prev card", "上一张", "上一个"],
  repeat: ["repeat", "say again", "再读一遍", "重复"],
  explainIntent: ["解释", "详细", "举例"],
} as const;
