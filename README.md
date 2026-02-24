# Anki Flashcards

Next.js + Convex app for reading and editing Anki-style flashcards with
Markdown and Mermaid diagram support.

## Features

- Markdown rendering with GitHub-flavored tables, lists, and task lists
- Mermaid diagrams via fenced code blocks
- Real-time updates powered by Convex WebSockets
- Create, edit, delete, and preview flashcards
- Decks for grouping related cards
- Clerk authentication with protected app routes

## Getting Started

Install dependencies:

```bash
npm install
```

Create a Convex deployment and generate local config:

```bash
npx convex dev
```

Add the Convex URL to `.env.local`:

```bash
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

Set up Clerk authentication (create a Clerk app and copy the keys):

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/cards
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/cards
```

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the marketing site,
then sign in to access the flashcard app at `/cards`.
