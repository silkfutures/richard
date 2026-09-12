# Nathan — Command Centre

A private, installable personal operating system for Nathan's projects, tasks, notes and Jarvis conversations.

## Stack

- Next.js App Router on Vercel
- Neon Postgres with Drizzle ORM
- Vercel AI Gateway for Jarvis and voice transcription
- Password-protected owner access
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
- `COMMAND_CENTRE_PASSWORD`: owner login password
- `AUTH_SECRET`: high-entropy signing secret
- `AI_GATEWAY_API_KEY`: optional locally; Vercel deployments use Vercel OIDC automatically
