# ChessOx — Architecture

## Overview

ChessOx is a royal-themed online chess platform built on **React 19 + TanStack Start (SSR)** with **Supabase** (Postgres, Auth, Realtime, RLS) as the backend. Rendering is server-side via a fetch handler (`src/server.ts`); the browser talks to Supabase directly for reads/realtime, while all integrity-sensitive writes go through server-authoritative functions.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (React 19, TanStack Router/Query, Tailwind v4)       │
│   routes/ ── pages         hooks/ ── data hooks (useAuth…)   │
│   components/ ── UI         lib/api/gameClient ── service layer│
└───────────────┬───────────────────────────┬─────────────────┘
                │ reads / realtime           │ writes (authoritative)
                ▼                            ▼
┌──────────────────────────┐   ┌────────────────────────────────┐
│ Supabase (RLS-guarded)   │   │ Server functions (Node)         │
│  Postgres + Realtime     │   │  src/lib/api/game.functions.ts  │
│  SECURITY DEFINER RPCs   │◀──│  validates moves w/ chess.js,   │
│  (create/join/matchmake/ │   │  writes via service role        │
│   resign/draw/timeout)   │   └────────────────────────────────┘
└──────────────────────────┘
```

## Key principles

- **Server authority for games.** Clients cannot write `games`/`game_moves` directly (RLS revokes it). Moves are validated server-side (`makeMove` server fn, chess.js) and committed with the service-role key. Non-chess transitions (create/join/matchmake/resign/draw/timeout) are `SECURITY DEFINER` RPCs that enforce their own auth/turn/clock rules. This makes results and ratings unforgeable.
- **Service layer.** `src/lib/api/gameClient.ts` is the single typed entry point for all game/matchmaking actions; routes/components never hand-roll RPC calls.
- **Separation of concerns.** Cross-cutting concerns live in dedicated modules: `lib/logger.ts` (structured logs), `lib/security-headers.ts` (CSP/headers), `lib/rate-limit.ts`, `lib/presence.ts` (online presence), `lib/anticheat/` (fair play).
- **Defense in depth.** RLS on every table + server validation + input validation (Zod) + security headers + rate limiting.
- **Fair play is observational, not authoritative.** The anti-cheat subsystem records evidence and scores risk; it never blocks a move or bans an account. Enforcement is admin-driven behind a server-enforced multi-indicator gate. See [ANTI_CHEAT.md](./ANTI_CHEAT.md).
- **A live position never leaves the players.** While a game is `active`, its row and moves are readable only by its two players (and admins). Spectators receive a _reconstructed_ position through `get_spectator_game()`, delayed 20–30s for ranked play. Putting the delay in RLS rather than in the UI is what makes it worth having. See [SPECTATOR.md](./SPECTATOR.md).

## Request lifecycle

1. `src/server.ts` receives the request, serves `/healthz` directly, otherwise delegates to the TanStack Start SSR handler and applies security headers to every response.
2. `src/start.ts` registers global middleware: `attachSupabaseAuth` (client→server bearer token) and an error-normalizing request middleware.
3. Server functions that mutate state use `requireSupabaseAuth` to authenticate and obtain `userId`.

## Directory map

- `src/routes/` — file-based routes (pages).
- `src/components/site/` — chess + page UI; `components/ui/` — shadcn primitives.
- `src/hooks/` — `useAuth`, `useProfile`, `useFriends`, `useNotificationCount`, `useBoardSettings`.
- `src/lib/api/` — service layer (`gameClient.ts`) + server functions (`game.functions.ts`).
- `src/lib/chess/` — engine (negamax + piece-square tables) and puzzles.
- `src/lib/anticheat/` — fair-play detection, risk scoring, analysis pipeline.
- `src/lib/spectator/` — broadcast-delay vocabulary, live stats, opening book.
- `src/integrations/supabase/` — clients, auth middleware, generated types.
- `supabase/migrations/` — schema and RPCs.

See [API.md](./API.md), [DATABASE.md](./DATABASE.md), [ANTI_CHEAT.md](./ANTI_CHEAT.md), [DEPLOYMENT.md](./DEPLOYMENT.md), [MAINTENANCE.md](./MAINTENANCE.md).
