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

## Functions (RPCs)

`has_role`, `current_rating`, `create_challenge`, `join_game`, `matchmake`,
`leave_queue`, `resign_game`, `respond_draw`, `claim_timeout`,
`save_computer_game`, `apply_elo_change`. All are `SECURITY DEFINER` with a
pinned `search_path = public` and explicit `EXECUTE` grants (see API.md).

## Elo

`apply_elo_change(game_id)` — K-factor 24, standard expected-score formula.
Idempotent via the `games.elo_applied` flag; upserts rating rows at 100 if
missing; only runs for rated games with two human players.

## Conventions & gotchas

- **Default rating is 100** everywhere (not 1200/1500). Never reintroduce a higher default.
- Finished games are queried as `.not("ended_at","is",null).in("result",["white","black","draw"])`.
- `CREATE POLICY` does **not** support `IF NOT EXISTS` — use `DROP POLICY IF EXISTS` then `CREATE POLICY` (idempotent).
- Realtime is enabled for `games`, `game_moves`, `game_chat`, `matchmaking_pool`, `friends`, `notifications`.

## Applying migrations

```bash
supabase db push                 # against a linked project
# or paste each file in supabase/migrations/ into the SQL editor in order
```

After schema changes, regenerate types:

```bash
supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts
```
