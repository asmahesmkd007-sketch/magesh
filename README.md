# ♛ ChessOx

A royal Indian–themed online chess platform: live multiplayer, ranked Quick Match,
friend challenges, vs-computer, puzzles & rush, clubs, tournaments, news, friends,
and presence — built on **React 19 + TanStack Start (SSR)** and **Supabase**.

## Quick start

```bash
cp .env.example .env      # fill in Supabase values
npm ci
npm run dev               # http://localhost:8080
```

## Scripts

| Script              | What it does                       |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Dev server                         |
| `npm run build`     | Production SSR + client build      |
| `npm run start`     | Serve the built app (SSR) on :8080 |
| `npm run typecheck` | `tsc --noEmit`                     |
| `npm run lint`      | ESLint + Prettier                  |
| `npm test`          | Vitest unit tests                  |

## How it works (short version)

- The **database is the source of truth** for games. Clients can't write game state directly; moves are validated server-side with chess.js (`submitMove`) and other transitions go through `SECURITY DEFINER` RPCs. This makes wins and ratings unforgeable.
- The **service layer** (`src/lib/api/gameClient.ts`) is the single typed entry point for game/matchmaking actions.
- Cross-cutting concerns are modular: structured logging, security headers/CSP, rate limiting, presence.

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [API reference](./docs/API.md)
- [Database & schema](./docs/DATABASE.md)
- [Deployment](./docs/DEPLOYMENT.md)
- [Maintenance runbook](./docs/MAINTENANCE.md)

## Tech stack

React 19 · TanStack Start/Router/Query · TypeScript · Tailwind v4 · shadcn/Radix ·
chess.js · Supabase (Postgres, Auth, Realtime, RLS) · Vite 7 · Vitest.

## Requirements for live multiplayer

Set `SUPABASE_SERVICE_ROLE_KEY` (server-only) so authoritative moves can be
committed. See [.env.example](./.env.example) and [Deployment](./docs/DEPLOYMENT.md).
