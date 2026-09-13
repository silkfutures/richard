# Nathan — Command Centre

A private, installable personal operating system for Nathan's projects, tasks, notes and Rich conversations.

## Stack

- Next.js App Router on Vercel
- Neon Postgres with Drizzle ORM
- Vercel AI Gateway for Jarvis and voice transcription
- Direct access without an app-level password
- Progressive Web App support for the iPhone Home Screen

## Setup

1. Link the repository to a Vercel project.
2. Provision Neon Postgres through the Vercel Marketplace.
3. Copy `.env.example` to `.env.local` and supply the required values.
4. Run `npm run db:migrate`.
5. Place the private Sites export at `migration/private-data.json` and run `npm run db:import` once.
6. Run `npm run dev`.

`migration/private-data.json`, `.env.local` and all other environment files containing secrets are intentionally excluded from Git.

## Environment variables

- `DATABASE_URL`: Neon Postgres connection string
- `AI_GATEWAY_API_KEY`: optional locally; Vercel deployments use Vercel OIDC automatically
- `OPENAI_API_KEY`: powers Rich's continuous two-way Realtime voice mode

## Updating without losing data

Keep the existing Vercel project's `DATABASE_URL` unchanged. Every deployment runs the included additive migrations before building; these migrations preserve existing projects, tasks, notes, completion history and Rich conversations.

The app itself has no password screen. Anyone with the public deployment URL can access its contents, so enable Vercel Deployment Protection if you later want restricted access.
