# ChessOx — Database

PostgreSQL via Supabase. **Row-Level Security is enabled on every table.**
Schema lives in `supabase/migrations/` (applied in filename order).

## Tables

| Table                                | Purpose                       | Notable columns                                                                    | Write access                  |
| ------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------- | ----------------------------- |
| `profiles`                           | User identity, presence, tier | `username`, `premium_tier`, `is_online`, `last_seen`                               | owner update; public read     |
| `user_roles`                         | RBAC                          | `role` (admin/moderator/user)                                                      | service role / signup trigger |
| `ratings`                            | Per-time-class Elo            | `rating` (default **100**), `peak_rating`, `games_played`                          | owner + `apply_elo_change`    |
| `games`                              | Match state                   | `status`, `result`, `fen`, `turn`, `white_time_ms`, `black_time_ms`, `elo_applied` | **RPC/server fn only**        |
| `game_moves`                         | Move ledger                   | `ply`, `san`, `uci`, `fen_after`                                                   | **server fn only**            |
| `spectator_config`                   | Broadcast delay bands         | `casual/ranked/final_delay_seconds`, `session_ttl_seconds`                         | admin                         |
| `spectator_sessions`                 | Who is watching what          | `(game_id, user_id)`, `last_seen`                                                  | `spectator_heartbeat()` only  |
| `spectator_counts`                   | Denormalised viewer totals    | `viewers`, `peak`                                                                  | `spectator_heartbeat()` only  |
| `game_chat`                          | In-game chat                  | `body` (1–500 chars)                                                               | author insert                 |
| `matchmaking_pool`                   | Quick Match queue             | `time_control`, `rating`, `joined_at`                                              | owner + `matchmake`           |
| `puzzles`                            | Tactics                       | `fen`, `moves`, `themes[]`, `theme`, `goal`, `rating`                              | read-only                     |
| `puzzle_attempts`                    | Puzzle history                | `solved`, `puzzle_rating`                                                          | owner insert                  |
| `friends`                            | Social graph                  | `status` (pending/accepted/blocked)                                                | participants                  |
| `clubs` / `club_members`             | Communities                   | `slug`, `member_count`, `cover_gradient`                                           | owner / members               |
| `tournaments` / `tournament_entries` | Events                        | `status`, `prize_pool`, `player_count`                                             | admin / participants          |
| `news_articles`                      | Content                       | `category`, `is_featured`, `published`                                             | admin (via `has_role`)        |
| `notifications`                      | Alerts                        | `kind`, `read`                                                                     | owner + service               |
| `subscriptions`                      | Billing placeholder           | `tier`, `status`, `provider`                                                       | service role                  |

### Anti-cheat tables

All seven are **read-only to admins** (RLS `has_role(auth.uid(),'admin')`) and
**writable only by the service role** — the browser can neither read its own
risk data nor forge evidence. `user_id`/`game_id` are deliberately plain UUIDs,
not foreign keys: a cascading delete would destroy evidence when an account or
game is removed.

| Table                 | Purpose                              | Notable columns                                        |
| --------------------- | ------------------------------------ | ------------------------------------------------------ |
| `anti_cheat_events`   | Canonical evidence log (append-only) | `event_type`, `severity`, `source`, `metadata`         |
| `browser_events`      | Batched client telemetry             | `event_type`, `count`, `window_started_at`             |
| `player_risk_scores`  | One row per player; the 0-100 score  | `total_score`, `risk_level`, per-category + `raw_*`    |
| `anti_cheat_flags`    | Reviewable findings (a flag ≠ a ban) | `flag_type`, `severity`, `status`, `risk_contribution` |
| `device_fingerprints` | Multi-account signals                | `fingerprint_hash`, `ip_hash` (salted), `times_seen`   |
| `admin_reviews`       | Every human decision                 | `decision`, `notes`, `admin_id`                        |
| `enforcement_actions` | The only source of bans/suspensions  | `action`, `reason`, `expires_at`, `created_by`         |

`profiles.account_status` (`active`/`restricted`/`suspended`/`banned`) is the
anti-cheat authority; the move handler refuses moves from suspended accounts.

## Functions (RPCs)

`has_role`, `current_rating`, `create_challenge`, `join_game`, `matchmake`,
`leave_queue`, `resign_game`, `respond_draw`, `claim_timeout`,
`save_computer_game`, `apply_elo_change`. All are `SECURITY DEFINER` with a
pinned `search_path = public` and explicit `EXECUTE` grants (see API.md).

Spectator reads: `get_spectator_game` (delayed position feed),
`list_live_games` (browse feed), `can_spectate`, `spectator_delay_seconds`.
Spectator writes: `spectator_heartbeat`, `spectator_leave`,
`set_spectator_visibility`, `set_spectator_default`.

Anti-cheat reads: `anticheat_overview`, `anticheat_list_players`,
`anticheat_list_flags`, `anticheat_player_detail`, `anticheat_game_evidence`
(each raises `Admin only` for non-admins). Service-role only:
`anticheat_notify_admins`, `anticheat_expire_enforcements`. Every anti-cheat
**mutation** goes through a server function instead of an RPC so that risk
scoring stays in one place (`src/lib/anticheat/risk.ts`).

## Elo

`apply_elo_change(game_id)` — K-factor 24, standard expected-score formula.
Idempotent via the `games.elo_applied` flag; upserts rating rows at 100 if
missing; only runs for rated games with two human players.

## Live games are not publicly readable

Since SECTION 104 (spectator mode), a game with `status = 'active'` — and
its `game_moves` — is readable **only by its two players and admins**.
Waiting and finished games remain fully public.

This is what makes the spectator broadcast delay real: a client cannot
read the live `fen` at all, so the delay cannot be bypassed by skipping
the UI. Non-players reach a game through:

- `public.live_games` — a position-free view of in-progress matches
  (who, rating, format, move count). Use this for "is X playing now".
- `get_spectator_game(id)` — the delayed position feed.

Server-side code is unaffected: it uses the service role, which bypasses
RLS. See [SPECTATOR.md](./SPECTATOR.md).

## Conventions & gotchas

- **Default rating is 100** everywhere (not 1200/1500). Never reintroduce a higher default.
- Finished games are queried as `.not("ended_at","is",null).in("result",["white","black","draw"])`.
- **Never add a client read of `games` for a game you are not seated in** — it will return nothing. Use `live_games` or `get_spectator_game()`.
- `CREATE POLICY` does **not** support `IF NOT EXISTS` — use `DROP POLICY IF EXISTS` then `CREATE POLICY` (idempotent).
- Realtime is enabled for `games`, `game_moves`, `game_chat`, `matchmaking_pool`, `friends`, `notifications`. Realtime honours RLS, so a spectator receives no `games` updates — that is intentional, not a bug.

## Applying migrations

```bash
supabase db push                 # against a linked project
# or paste each file in supabase/migrations/ into the SQL editor in order
```

After schema changes, regenerate types:

```bash
supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts
```
