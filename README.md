# AIANKIPRO

AIANKIPRO is for people who struggle to stay focused while learning and still forget after rereading notes.

Try it at https://aiankipro.com.

## What The App Actually Does

This is the real flow in the product right now:

1. You type a topic and pick a level.
2. AI creates a first draft of cards.
3. You can edit the draft or ask for a rewrite.
4. When you save, the app opens a first study run in the same card order that was generated.
5. As you review, cards you struggled with come back sooner and easy cards come back later.
6. If a card is confusing, you can open card chat for that exact card and ask follow-up questions.
7. Voice mode lets you study hands-free: answer out loud, flip cards, move next/previous, and ask tutor questions by voice.

## How Chat Helps (In Plain English)

Card chat is not a generic chatbot tab.
It is attached to the current card, so the explanation stays about that concept.

- Ask "explain this simply"
- Ask "give me one real example"
- Ask "how is this different from X"

Your chat history for that card is saved, so next time you hit the same card you can continue where you left off.

## How Voice Helps (In Plain English)

Voice mode is useful when focus is low or you do not want to type.

- Say commands like "flip", "next", "show back", "easy", "hard"
- Speak your answer out loud before revealing the card
- Ask tutor questions by voice without leaving study flow
- Listen to spoken responses (premium voice when available, browser voice fallback otherwise)

## Real Problems And Friend-Style Ways To Use It

- "I keep forgetting everything before tests."
  You can try aiankipro.com by starting with one chapter, not the whole subject. Generate cards, do one short round, and rate honestly. Come back daily and clear due cards. This builds memory step by step instead of last-minute cramming.

- "My notes are messy and I never know where to begin."
  Start with one topic and let the app make the first draft. Delete weak cards fast, rewrite a few in your own words, then save and begin the guided first run immediately.

- "I understand only after someone explains it."
  Open card chat on the hard card and ask for a simpler explanation plus one example. Keep that chat with the card, so you can revisit it next time instead of starting over.

- "I cannot do long study sessions."
  Use 10-minute rounds. One deck, one goal, done. If typing feels heavy, switch to voice mode and continue by speaking.

## Core Product Capabilities

- Topic-to-card generation with editable drafts
- Draft autosave and resume
- Save to an existing deck or auto-create a new one
- First-run study opened automatically in generated order
- Review scheduling based on how easy or hard each card felt
- Per-card tutor chat with saved history and summaries
- Voice commands + spoken answer handling + voice tutor flow
- English and Chinese UI

## Tech Stack

- Next.js (App Router, TypeScript)
- Convex (data, realtime, server functions)
- Auth.js / NextAuth
- Paddle (billing)
- OpenAI-compatible LLM APIs via LangChain

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Copy environment template and fill required values:

```bash
cp .env.example .env.local
```

3. Start Convex dev deployment:

```bash
npx convex dev
```

4. Run the app:

```bash
npm run dev
```

5. Open http://localhost:3000

## Testing

```bash
npm run test:e2e
```

## Build

```bash
npm run build
```
