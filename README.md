# ActionPulse

ActionPulse is a single Cloudflare Worker app with static assets and one shipped workflow:

1. Open `/app`
2. Paste meeting notes
3. Generate a summary and action items

The repo is now flattened so the root folder is the only app package and source of truth.

## Stack

- Cloudflare Workers
- Hono
- Chanfana
- Static assets served from `public/`
- Groq for text extraction

## Project Layout

```text
actionpulse-v2/
|-- public/
|   |-- index.html
|   |-- app.html
|   |-- login.html
|   `-- checkout.html
|-- src/
|   |-- index.ts
|   |-- types.ts
|   `-- endpoints/
|       `-- extract.ts
|-- wrangler.json
|-- tsconfig.json
|-- worker-configuration.d.ts
`-- package.json
```

`login.html` and `checkout.html` are placeholder future-plan pages, not active product features.

## Local Development

```bash
npm install
npm run dev
```

For local Cloudflare development, Wrangler reads secrets from `.dev.vars`.

## Required Secret

Set this in Cloudflare before deploying:

```bash
wrangler secret put GROQ_API_KEY
```

## Deploy

```bash
npm run deploy
```

## Current Product Scope

- Text note input
- Summary generation
- Action item extraction
- Suggested owners, deadlines, priorities, next steps, and AI prompts

## Future Plans

- User accounts
- Saved meeting history
- Audio recording and transcription
- Subscriptions and payments
- Team sharing and integrations
