# ChessOx — Spectator Mode

Watching a live game, without handing anyone a real-time feed of a game
in progress. One principle: **the delay is a database property, not a UI
property.**

## The problem

Before this feature, `games` was `SELECT ... USING (true)`. The live
`fen` of every in-progress game was readable, in real time, by anyone
holding the anon key. A "spectator delay" implemented in React would
have been theatre — a cheater reads the row, not the interface.

So spectating was built the other way round: close the tables first,
then hand out a delayed view through a function that cannot be talked
past.

## How it works

```
┌────────────────────────────────────────────────────────────┐
│ Spectator's browser                                         │
│   useSpectatorGame → poll every 2.5s                        │
└───────────────────────────┬────────────────────────────────┘
                            │ get_spectator_game(id)
                            ▼
┌────────────────────────────────────────────────────────────┐
│ SECURITY DEFINER RPC                                        │
│   1. can_spectate(id, uid)?           → else refuse         │
│   2. delay := spectator_delay_seconds(id)                   │
│   3. cutoff := now() - delay                                │
│   4. REBUILD position from game_moves WHERE created_at ≤ cutoff │
│   5. mask result/winner if ended_at > cutoff                │
└───────────────────────────┬────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────────┐
│ games / game_moves  — RLS: players + admins only while      │
│                       status = 'active'                     │
└────────────────────────────────────────────────────────────┘
```

`games.fen` is never read on the spectator path. The position is
reconstructed from the plies that have cleared the embargo, so there is
no code path on which a spectator receives a newer one.

## Delay bands

Configured in `public.spectator_config` (one row, admin-updatable), with
CHECK constraints pinning each band to the range the product spec sets:

| Band             | Range  | Default | Applies to                    |
| ---------------- | ------ | ------- | ----------------------------- |
| Casual           | 0–5s   | 3s      | Unrated games                 |
| Ranked           | 20–30s | 25s     | Rated games                   |
| Tournament final | 30–60s | 45s     | Highest round of a tournament |

Two exceptions get delay 0: **players watching their own game** (they
already have the position) and **finished games** (a settled position
cannot help anyone cheat).

`src/lib/spectator/delay.ts` mirrors these numbers for the UI only —
it labels the delay, it does not create it. A unit test asserts the
client defaults stay inside the ranges the database enforces.

## Visibility

Three settings, per the spec: **public**, **friends**, **private**.

Each player controls their **own side** of a match:

- `profiles.spectator_default` — the account-wide default, and the only
  place the choice can be made before a Quick Match (which pairs you
  into an active game with no lobby).
- `games.white_spectator_pref` / `black_spectator_pref` — per-match
  overrides, settable by that player at any time during the game.

The **effective** visibility is the more restrictive of the two players'
preferences. That asymmetry is deliberate: a player can always shut
their own game off from an audience, and can never expose an opponent
who did not agree to one. Setting `private` also empties the room
immediately rather than waiting for viewers to age out.

Games against the engine are never spectatable by anyone but the player.

## Viewer counts

`spectator_sessions` is keyed `(game_id, user_id)` and refreshed by a
20s heartbeat; `spectator_counts` holds the denormalised total so the
browse page reads one row per game instead of aggregating an unbounded
session table.

Counting is **per account**, so ten tabs are one viewer. Signed-out
viewers can watch public games but are deliberately not counted, rather
than counted from a token anyone could mint — the number on screen is
conservative on purpose. `spectator_heartbeat()` prunes that game's
expired sessions on every call, so the table self-cleans under exactly
the traffic that fills it and needs no cron job.

## Why polling, not realtime

Every other live surface here subscribes to `postgres_changes` on
`games`. A spectator cannot: that channel carries the _current_ fen,
which is the one thing they must not have. The poll interval (2.5s) is
immaterial next to the delay it sits behind — 2.5s added to a
deliberate 25s is not a latency problem.

The browse feed polls at 10s, backing off to 60s on a hidden tab, and
both feeds resume immediately when the tab regains focus.

## What spectators do NOT get

- **Engine evaluation and per-move accuracy while a game is live.**
  These are engine output; streaming them to an audience rebuilds the
  ghost-coaching channel the delay exists to close. They belong to the
  post-game review (`/game/$id/review`).
- **A board thumbnail on the browse page.** A preview would need the
  live fen. `list_live_games()` reads `public.live_games`, a view with
  no position columns at all, so the cards sell a match on its players.

## Module map

| Module                                            | Responsibility                                       |
| ------------------------------------------------- | ---------------------------------------------------- |
| `supabase/schema.sql` SECTION 104                 | RLS lockdown, config, RPCs — **the enforcement**     |
| `lib/api/spectatorClient.ts`                      | Typed service layer; the only wire format            |
| `lib/spectator/delay.ts`                          | Delay vocabulary + copy (presentation only)          |
| `lib/spectator/stats.ts`                          | Material, pace, repetition — pure, from the FEN      |
| `lib/spectator/openings.ts`                       | Which name to show; the book is `lib/chess/openings` |
| `lib/spectator/flags.ts`                          | Country name → emoji flag                            |
| `hooks/useSpectatorGame.ts`                       | Delayed feed poll, replay cursor, heartbeat          |
| `hooks/useLiveGames.ts`                           | Browse feed                                          |
| `components/spectator/*`                          | Match card, board rail, controls, stats, move list   |
| `routes/watch.index.tsx` · `routes/watch.$id.tsx` | Browse and spectator views                           |

## Consequences elsewhere

Closing `games` to non-players changed two existing surfaces:

- `useFriends` now reads `public.live_games` for "Playing now" instead
  of `games` — same fact, no position.
- `/game/$id` opened by a non-participant no longer spins forever; it
  offers the spectator feed instead.

Everything else that reads `games` was already filtering to finished
games (`.not("ended_at","is",null)`), and server-side code uses the
service role, which bypasses RLS.

## Applying the schema

SECTION 104 is idempotent and self-contained — copy it out of
`supabase/schema.sql` into the SQL editor, or run `supabase db push`.
After applying, regenerate types:

```bash
supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts
```

## Not yet built

Phase 1 is the watch pipeline. The spec's engagement layer — spectator
chat, live reactions, predictions, Fan Points, player following, Coach
Mode, the spectator-only engine view and the tournament broadcast
dashboard — is not implemented. All of it stacks on this feed rather
than changing it.
