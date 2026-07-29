# Ranking System — ELO + Season Points

ChessOX runs **two independent ranking systems**. They answer different
questions and never share a number:

| System            | Question                              | Resets? | Scope             |
| ----------------- | ------------------------------------- | ------- | ----------------- |
| **ELO rating**    | Who is the strongest player?          | Never   | Per time class    |
| **Season Points** | Who is the best player *this season*? | Monthly | One ladder        |

Backend: `supabase/schema.sql` **SECTION 102**. Shared model:
`src/lib/ranking/`. Service layer: `src/lib/api/rankingClient.ts`.
Player-facing page: `/rankings`. Admin: `/admin/ranking`.

---

## Architecture

```
routes/rankings.tsx                  ← player page (3 tabs)
├─ components/ranking/RankCard        ← the viewer's standing in both systems
├─ components/ranking/RankingLeaderboard
│    ELO ⇄ SP toggle × Global/Country/State/District/Friends
├─ components/ranking/HallOfFame      ← frozen records of past seasons
└─ components/ranking/SeasonRules     ← renders the LIVE config, not hardcoded copy

lib/ranking/tiers.ts   ← SP ladder, earn rates, upset bonus, penalties, rewards
lib/ranking/elo.ts     ← rating maths, K-factor schedule, display bands
lib/api/rankingClient.ts ← every RPC, typed
```

The server is the **sole authority** for awarding points and setting a
player's rung. The TypeScript modules mirror the rules so the UI can
render tiers and "what's at stake" without a round trip — they never
write anything.

---

## 1. Permanent ELO

Standard Elo with an expected-score curve, so beating a stronger
opponent always gains more than beating a weaker one. Tracked per time
class (`bullet`/`blitz`/`rapid`/`classical`), starting at **100**.

**K-factor schedule** (`public.elo_k_factor`, mirrored by `kFactor()`):

| Condition                | K   | Why                                    |
| ------------------------ | --- | -------------------------------------- |
| < 15 games (provisional) | 40  | New players find their level fast      |
| rating ≥ 2400            | 12  | Keeps the top of the ladder stable     |
| rating ≥ 1800            | 20  |                                        |
| otherwise                | 24  |                                        |

Ratings floor at 0. `apply_elo_change(game_id)` is idempotent per game
(`games.elo_applied`) and writes `rating_history` for the rating graph.

Leaderboards require **5+ rated games** so the top isn't full of
one-game accounts.

## 2. Season Points

Every season starts everyone at **0 SP**. The ladder is **7 tiers ×
3 divisions = 21 rungs**, Bronze III → Grandmaster I.

Earning gets harder as you climb — this is the core design decision.
A Bronze player nets +30 per win and only loses 8; a Grandmaster nets
+18 and loses 20, so holding the top tier requires a genuinely winning
record rather than volume.

| Tier        | Win | Draw | Loss | Entry (Div III) |
| ----------- | --- | ---- | ---- | --------------- |
| Bronze      | +30 | +10  | −8   | 0               |
| Silver      | +28 | +9   | −10  | 500             |
| Gold        | +26 | +8   | −12  | 1,150           |
| Platinum    | +24 | +7   | −14  | 1,950           |
| Diamond     | +22 | +6   | −16  | 2,900           |
| Master      | +20 | +5   | −18  | 4,000           |
| Grandmaster | +18 | +4   | −20  | 5,300           |

**Upset bonus** on wins against a higher tier: +3 (1 tier up), +5 (2),
+8 (3 or more).

**Conduct penalties**, stacked on top of the result: disconnect −20,
time forfeit −15, AFK −20, cheating −100 (plus removal from the season
board and a review).

**Promotion** is immediate on crossing a threshold. **Demotion** only
happens once SP falls `demotion_grace_sp` (default 50) *below* the
current rung's floor, so one loss never costs a rank. Both emit a
notification (`rank_promotion` / `rank_demotion`).

### Anti-abuse

Enforced inside `_season_award_sp` and the game trigger, not by callers:

- **Farming guard** — after `repeat_opponent_limit` (5) games against the
  same opponent in a season, further wins pay `repeat_opponent_pct`
  (25%) of normal. Tracked in `season_opponent_counts`.
- **Daily cap** — `daily_sp_cap` (600) limits *gains* per UTC day.
  Penalties always land in full.
- **Minimum length** — games under `min_moves_for_sp` (6) plies award
  nothing; aborted / no-show / vs-computer / unrated games are skipped.
- **Idempotent ledger** — `season_iq_events` has a UNIQUE
  `(season_id, user_id, kind, ref)`, so a replayed trigger pays once.
- **Season ban** — a cheating verdict sets `season_rankings.banned`,
  which excludes the player from every leaderboard and stops all earning.

---

## Storage note (important)

`season_rankings.season_iq` is the physical column that holds **Season
Points**. The name is historical (SECTION 77 called the metric "Season
IQ"). Every SECTION 102 RPC exposes it as `season_points`. There is
deliberately **no second column** — one number, one source of truth.
Don't "fix" this by adding `season_points`; the two would drift.

The player's rung is denormalised onto `rung_id` / `rung_index` / `tier`
so leaderboards never recompute it.

---

## Configuration

Everything tunable lives in the `public.season_config` singleton
(JSONB), read on **every** award — changes take effect without a
redeploy or restart.

| Key                                          | Default | Meaning                              |
| -------------------------------------------- | ------- | ------------------------------------ |
| `sp_rates`                                    | table above | Per-tier win/draw/loss           |
| `upset_bonus`                                 | 3/5/8   | By tier gap                          |
| `penalties`                                   | see above | Conduct deductions                 |
| `ladder`                                      | 21 rungs | `[{id, min}]`, ascending            |
| `demotion_grace_sp`                           | 50      | Buffer before demotion               |
| `min_moves_for_sp`                            | 6       | Shorter games pay nothing            |
| `daily_sp_cap`                                | 600     | 0 disables                           |
| `repeat_opponent_limit` / `repeat_opponent_pct` | 5 / 25% | Farming guard                     |

Edit at `/admin/ranking`, or via `admin_update_season_config(patch)`
(partial patch — pass only the keys you're changing). The player-facing
"How it works" tab renders this same config, so published rules can
never drift from enforced rules.

---

## RPC reference

| RPC                                          | Who      | Purpose                                  |
| -------------------------------------------- | -------- | ---------------------------------------- |
| `elo_leaderboard(time_class, scope, …)`      | public   | ELO board, 5 scopes                      |
| `sp_leaderboard(season_id, scope, …)`        | public   | Season board, 5 scopes                   |
| `player_ranking_card(user_id, time_class)`   | public   | Both systems + career, one round trip    |
| `hall_of_fame(season_number, …)`             | public   | Frozen finishes                          |
| `hall_of_fame_champions(limit)`              | public   | One winner per finished season           |
| `sp_rung(sp)` / `sp_tier_code(sp)`           | public   | Ladder lookup                            |
| `apply_season_penalty(user, kind, ref, …)`   | service  | Anti-cheat / moderation hook             |
| `award_season_tier_rewards(season_id)`       | service  | Reward bundles on the live board (optional) |
| `admin_get_season_config` / `admin_update_season_config` | admin | Configuration            |
| `admin_adjust_season_points(user, pts, why)` | admin    | Manual adjustment (ledgered + notified)  |
| `admin_set_season_ban(user, banned, why)`    | admin    | Remove from / restore to the season      |
| `admin_ranking_analytics()`                  | admin    | Distribution + volume dashboard          |

`scope` is one of `global | country | state | district | friends`.
Geographic scopes read the viewer's `profiles.country/state/district`;
`friends` needs `p_viewer` and reads accepted rows from `friends`.

---

## Season-end rewards

Reward bundles are applied by a **BEFORE INSERT OR UPDATE trigger on
`season_history`** (`_season_history_enrich`, SECTION 102.15). Every
frozen row gets, at write time:

- `rung_id` / `rung_index` / `peak_sp` resolved from its final SP
- `tier` normalised to a v2 tier code (`grandmaster`, not `Expert`)
- the tier bundle below plus a placement reward
  (`top_1` / `top_3` / `top_10` / `top_100`), merged and de-duplicated

Putting this on the trigger rather than inside `admin_end_season` means
it applies no matter which path finalises the season (`admin_end_season`
or `season_rollover`), and re-finalising is idempotent.

`award_season_tier_rewards(season_id)` applies the same bundles to the
**live** `season_rankings` board, so standings show rewards before a
freeze. It is optional — history correctness does not depend on it.

Banned players are excluded from ranking entirely
(`_season_recompute_rankings`), so a fair-play removal cannot place,
earn rewards, or reach the Hall of Fame.

| Tier        | Rewards                                                     |
| ----------- | ----------------------------------------------------------- |
| Bronze      | Profile badge                                               |
| Silver      | Badge + coins                                               |
| Gold        | Coins + premium avatar                                      |
| Platinum    | Coins + profile frame + title                               |
| Diamond     | Animated badge                                              |
| Master      | Exclusive theme                                             |
| Grandmaster | Crown badge, border, Hall of Fame entry, season trophy      |

---

## Testing

`src/lib/ranking/tiers.test.ts` (23) and `elo.test.ts` (16) cover the
pure model: ladder monotonicity, boundary resolution, progress, upset
bonuses, penalty ordering, band coverage, K-factor schedule, Elo
symmetry and zero-sum behaviour. `tiers.test.ts` also includes
**pacing simulations** that assert a 50%-score casual player lands in
the lower tiers and a losing record can never reach Grandmaster — these
are the guardrails to re-run after any rate change.

The SQL engine itself is not unit-tested (no Postgres in CI). Verify
SECTION 102 against a real database before relying on it in production —
see below.

---

## Deployment

1. Apply `supabase/schema.sql` (idempotent) or extract SECTION 102 as a
   standalone migration.
2. SECTION 102 **replaces** `handle_season_game_finished` and
   `apply_elo_change` via `CREATE OR REPLACE`; the existing
   `trg_season_game_finished` trigger is re-created pointing at the new
   function. The legacy `_season_award_iq` remains as a shim so SECTION
   77 callers (puzzles, tournaments) keep working through the v2 engine.
3. The backfill at the end of 102.14 syncs pre-existing rankings onto
   the ladder. It only touches rows still on the default rung, so
   re-running never rewrites live data.
4. Smoke-test after deploy: `SELECT * FROM sp_rung(1200);` should return
   `gold_3`, and `SELECT sp_leaderboard();` should return the live board.
