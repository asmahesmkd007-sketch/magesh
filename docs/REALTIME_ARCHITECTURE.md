# Live gameplay: Socket.IO architecture

Live multiplayer no longer flows through Supabase Realtime `postgres_changes`.
Moves are validated and broadcast by an authoritative in-memory game server that
runs inside the existing application process. Supabase remains the system of
record — auth, profiles, matchmaking, final game storage, ratings, history — but
it is no longer in the move path.

---

## Before

```
Player A                      Supabase                         Player B
   │                             │                                │
   │ optimistic render           │                                │
   │──── POST /_serverFn ───────>│                                │
   │      makeMove               │                                │
   │                       auth API round-trip                    │
   │                       SELECT games                           │
   │                       SELECT profiles                        │
   │                       SELECT game_moves  (replay whole game)  │
   │                       INSERT game_moves                      │
   │                       UPDATE games                           │
   │                             │                                │
   │                        Postgres WAL                          │
   │                             │                                │
   │                     Realtime (postgres_changes)              │
   │                             │───────────────────────────────>│
   │                             │                        board updates
   │
   └── every move = 5+ DB round-trips + WAL decode + fan-out
```

The database was the transport. Every move paid an auth round-trip, several
serial queries, two writes, WAL decoding and Realtime fan-out before the
opponent saw anything.

## After

```
Player A                  App process (one port)                Player B
   │                             │                                │
   │ optimistic render           │                                │
   │══ socket: game:move ═══════>│                                │
   │                             │ chess.js validate              │
   │                             │ clock press                    │
   │                             │ terminal check                 │
   │                             │ (all in memory, no I/O)        │
   │<════════ ack ═══════════════│══════ game:move ══════════════>│
   │                             │                        board updates
   │                             │
   │                    ┌────────┴────────┐
   │                    │ LiveGame (RAM)  │
   │                    │ chess.js + clock│
   │                    └────────┬────────┘
   │                             │  only on game over
   │                             ▼
   │                    ┌─────────────────┐
   │                    │    Supabase     │  PGN, moves, result,
   │                    │                 │  chat, ratings, history
   │                    └─────────────────┘
```

One in-memory validation, one broadcast. No database on the move path.

---

## Process topology

`node-server` (Nitro's default) calls srvx's `serve()` itself and keeps the
`http.Server` private, so nothing can attach a WebSocket upgrade handler. The
build now uses Nitro's **`node-middleware`** preset, which exports a plain Node
request handler and never listens — letting `server/index.mjs` own the server:

```
                    http.Server  (single port, single origin)
                         │
      ┌──────────────────┼──────────────────────┐
      │                  │                      │
  /realtime         /assets/**              everything else
  Socket.IO         /engine/**              Nitro middleware
  (WS + polling)    static files            (SSR + server fns)
                    .br/.gz, immutable
```

No sidecar, no second port, no reverse proxy, no CORS.

---

## Folder structure

```
server/
  index.mjs                    NEW  http.Server; routes static / socket / Nitro
scripts/
  build-realtime.mjs           NEW  esbuild bundle -> .output/server/realtime.mjs
src/realtime/
  protocol.ts                  NEW  typed event contract (shared client+server)
  server/
    entry.ts                   NEW  bundle entry: attachRealtime / shutdownRealtime
    io.ts                      NEW  Socket.IO wiring: auth, rooms, handlers
    LiveGame.ts                NEW  authoritative in-memory game
    LiveGame.test.ts           NEW  27 tests over the core rules
    registry.ts                NEW  hydration, flag timers, checkpoints, eviction
    persistence.ts             NEW  hydrate / checkpoint / finalize
  client/
    socket.ts                  NEW  shared socket + clock offset + request()
    useLiveGame.ts             NEW  hook replacing postgres_changes wiring
src/lib/auth/
  verifyToken.server.ts        NEW  framework-free token verification (shared)
  requireUser.server.ts        MOD  now a thin TanStack wrapper over the above
```

### Modified files

| File | Change |
|---|---|
| `vite.config.ts` | preset `node-server` → `node-middleware` |
| `package.json` | `start` → `node server/index.mjs`; `build` adds realtime bundle; `+socket.io`, `+socket.io-client` |
| `src/lib/auth/requireUser.server.ts` | verification logic extracted so the realtime bundle can share it without pulling in TanStack Start |

---

## Authority model

`LiveGame` is the only thing that may change a position, a clock or a result.

- **Moves** — `chess.js` validates against the live instance. Because the
  instance played every move, threefold/fivefold repetition and the PGN are
  simply correct; the old handler had to re-fetch and replay the entire move log
  on every move to approximate this.
- **Clocks** — the server owns time. It reuses the existing pure
  `src/lib/chess/clock.ts`, the same module the browser renders with, so the two
  cannot disagree about how time is computed. Clients hold a measured offset
  (`time:sync`) so a skewed device clock never shows wrong times.
- **Flag falls** — a per-game timer fires at the exact instant the side to move
  runs out, so a game ends on time even with both clients gone. This replaces the
  old client-initiated `claim_timeout` RPC, which only worked while someone was
  watching. FIDE 6.9 is honoured: a flag against insufficient mating material is
  a draw, not a loss.
- **Rejections** carry a full snapshot, so a refused move snaps the client back
  to the truth with no extra round-trip.

## Reconnect

Reconnect is not a special path — it is the join path.

1. `socket.io-client` reconnects with unlimited retries and a fresh token
   (`auth` is a callback, so a session refreshed while the tab slept is used).
2. On `connect`, the client re-emits `game:join`.
3. The server replies with a **complete** `GameStateSnapshot`.
4. The client replaces local state wholesale.

Short drops (≤60s) additionally use Socket.IO `connectionStateRecovery`, which
replays missed room events without a full resync. A detected ply gap triggers
`game:resync` rather than silent divergence.

## Spectators

Spectators join a separate room and receive the same events held back by a
broadcast delay (bullet 15s / blitz 20s / rapid 30s / classical 60s), preserving
the property the database view used to enforce: a live board must not double as
an engine feed for the player. Their snapshot is truncated to the last visible
move, so board and move list can never disagree. Delay drops to 0 once the game
is finished.

## Persistence

| When | What |
|---|---|
| First join | `hydrate()` — games + game_moves + game_chat → `LiveGame` |
| Every 30s, if dirty | `checkpoint()` — fen/turn/clock/moves_count **only** |
| Game over | `finalize()` — move rows, chat, PGN, result, clocks, then `apply_elo_change` |

`finalize()` is idempotent: `game_moves` carries `UNIQUE (game_id, ply)` and a
`persisted` guard prevents re-entry, so a retry can never double-apply a rating
change. Aborted games never move ratings.

**On the checkpoint.** The brief says "save the complete game only after it
finishes", and `finalize()` is the only thing that writes the complete game. The
30-second checkpoint writes four scalar columns and no move rows; it exists
because a process restart mid-game would otherwise lose the board entirely. It
is not per-move and it is not the game record.

## Schema

**No schema changes.** Existing tables and columns are used as-is.

---

## Migration steps

1. `npm install` (adds `socket.io`, `socket.io-client`).
2. `npm run build` — runs `vite build`, then bundles the realtime server to
   `.output/server/realtime.mjs`.
3. `npm start` — now `node server/index.mjs`.
4. Verify:
   ```
   curl -s "localhost:3000/realtime/?EIO=4&transport=polling"   # -> 0{"sid":...}
   curl -sI localhost:3000/assets/<hashed>.js -H 'Accept-Encoding: br'
   #   -> content-encoding: br, cache-control: ... immutable
   ```
5. Swap the board routes onto `useLiveGame` (see *Remaining work*).
6. Once routes are swapped, delete the `postgres_changes` subscriptions in those
   routes. Supabase Realtime stays enabled for non-gameplay features
   (notifications, presence, chat rooms, tournament feeds).

## Deployment changes

| Item | Before | After |
|---|---|---|
| Start command | `node .output/server/index.mjs` | `node server/index.mjs` |
| Deployed paths | `.output/` | `.output/` **and** `server/` |
| Ports | 1 | 1 (unchanged) |
| Processes | 1 | 1 (unchanged) |

Requirements introduced:

- **WebSocket passthrough** on whatever fronts the app (nginx: `proxy_set_header
  Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`). The polling
  fallback works without it, but the upgrade is what makes it fast.
- **Sticky sessions if you run more than one instance** — see below.
- `SIGTERM` is handled: the server drains, persists finished games and
  checkpoints in-progress ones before exiting, so a rolling deploy hands players
  over instead of dropping their boards.

### Scaling beyond one instance

Games live in the memory of one process, so a second instance would not see
them. Two options, in order of preference:

1. **Sticky sessions by `gameId`** at the load balancer — simplest, and correct
   because a game is inherently affine to one process.
2. **`@socket.io/redis-adapter`** for cross-instance fan-out, plus routing both
   players of a game to the same instance. The adapter alone is not sufficient:
   the authoritative `LiveGame` must be single-homed.

Single-instance deployment needs neither.

---

## Remaining work

The realtime layer is complete, built and tested end-to-end, but three UI
surfaces still subscribe to `postgres_changes` and have **not** been switched:

- `src/routes/game.$id.tsx`
- `src/components/tournament/ArenaBoard.tsx`
- `src/routes/watch.$id.tsx`

Until they are swapped, live play continues to use the old path. `useLiveGame`
is shaped to make the swap mechanical:

```ts
const live = useLiveGame(id);

// replaces: the three supabase.channel(...).on("postgres_changes", ...) blocks,
//           the initial games/game_moves/game_chat reads,
//           submitMove(), resignGame(), respondDraw(), claimTimeout()
const { snapshot, pending, activeFen, connection } = live;
await live.move(from, to, promotion);
await live.resign();
await live.offerOrAcceptDraw();
await live.sendChat(text);
```

`snapshot.clock` feeds the existing `clockFromServer` unchanged, and
`snapshot.moves` is the same shape the move list already renders.
