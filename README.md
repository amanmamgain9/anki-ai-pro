# Anki Flashcards

Next.js + Convex app for reading and editing Anki-style flashcards with
Markdown and Mermaid diagram support.

## Features

- Markdown rendering with GitHub-flavored tables, lists, and task lists
- Mermaid diagrams via fenced code blocks
- Real-time updates powered by Convex WebSockets
- Create, edit, delete, and preview flashcards
- Decks for grouping related cards
- Google OAuth authentication (Auth.js) with protected app routes
- AI card generation chat (topic + level) powered by Groq (Kimi model) via LangChain
- Built-in localization support (English + Chinese toggle)

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
NEXT_PUBLIC_CONVEX_SITE_URL=https://your-deployment.convex.site
```

Set up Auth.js / NextAuth base config:

```bash
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-long-random-secret
```

Generate a secure `NEXTAUTH_SECRET`:

```bash
openssl rand -base64 32
```

Create Google OAuth credentials:

1. Open Google Cloud Console: APIs & Services -> Credentials
2. Click Create Credentials -> OAuth client ID -> Web application
3. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://your-domain.com/api/auth/callback/google`
4. Copy Client ID + Client Secret into `.env.local`:

```bash
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret
```

Generate Convex JWT signing keys:

```bash
node scripts/generate-convex-auth-keys.mjs
```

Add the printed private key to `.env.local`:

```bash
CONVEX_AUTH_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
CONVEX_AUTH_KID=your-key-id
```

Add the printed `JWKS` to Convex environment:

```bash
npx convex env set JWKS '{"keys":[...]}'
```

Set up Paddle Billing:

1. Create products/prices in Paddle (monthly + yearly) and copy their `price_...` IDs.
2. Create a webhook endpoint in Paddle pointing to:
   - `https://your-domain.com/api/paddle/webhook` (production)
   - `http://localhost:3000/api/paddle/webhook` for local testing via tunnel
3. Subscribe to at least:
   - `subscription.created`
   - `subscription.updated`
   - `subscription.activated`
   - `subscription.canceled`
   - `subscription.past_due`
4. Copy env vars:

```bash
PADDLE_ENV=sandbox
PADDLE_API_KEY=...
PADDLE_WEBHOOK_SECRET=...
PADDLE_WEBHOOK_FORWARD_SECRET=...
PADDLE_PRICE_ID_MONTHLY=...
PADDLE_PRICE_ID_YEARLY=...
```

Set the webhook forward secret in Convex env too (must match `.env.local`):

```bash
npx convex env set PADDLE_WEBHOOK_FORWARD_SECRET your-shared-secret
```

Set up Groq for AI card generation (OpenAI-compatible endpoint):

```bash
GROQ_API_KEY=your-groq-api-key
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=moonshotai/kimi-k2-instruct-0905
```

Use the env template as a checklist:

```bash
cp .env.example .env.local
```

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the marketing site,
then sign in to access the flashcard app at `/cards`.

Use `/cards/generate` for chat-based generation: enter topic, choose level,
and cards are generated + saved automatically.

Use the language toggle in the header/sidebar to switch between English and Chinese.

## Local Webhook Testing

Paddle webhooks need a public URL. For local testing:

1. Start app locally:

```bash
npm run dev
```

2. Expose local server with a tunnel (example using `ngrok`):

```bash
ngrok http 3000
```

3. Put the tunnel URL in Paddle webhook destination:

```text
https://<your-ngrok-subdomain>.ngrok-free.app/api/paddle/webhook
```

4. Trigger a test event from Paddle and verify app/Convex logs.
