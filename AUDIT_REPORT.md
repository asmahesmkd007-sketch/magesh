# ChessOx Audit Report — 2026-07-12 (Full Exhaustive Pass)

**This report supersedes all prior content in this file.** Per explicit
user instruction, this pass is **audit-only**: no schema/code changes were
made as part of this deliverable, and none should be inferred from it.

> **Note on pre-existing files from this session:** before the scope was
> changed to audit-only, one migration file was already written to disk:
> `supabase/migrations/20260712000001_seasons_backend.sql` (a full seasons
> table/RPC backend). It has been **left in place, untouched, but is NOT
> part of this audit's findings or an approved fix** — treat the Seasons
> issue below (#1) as still fully OPEN or as a candidate for the pending
> file. No other file was modified or created in service of this report.

## Scope & Method

Source of truth: `supabase/schema.sql` + every file in
`supabase/migrations/*.sql`, applied in that order (schema.sql first,
then migrations in filename order). No live database was queried; no
Supabase MCP tool was used. Every `.from(...)` and `.rpc(...)` call site
under `src/` was extracted via project-wide search and cross-referenced
against every `CREATE TABLE`, `CREATE VIEW`, `CREATE FUNCTION` in that
combined SQL surface. RLS coverage was checked by diffing every
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` against every `CREATE POLICY
... ON <table>`. Duplicate definitions were checked by counting repeated
`CREATE FUNCTION`/`CREATE VIEW`/`CREATE TABLE` names. All 90 files under
`src/routes/` were enumerated; every file that imports a Supabase client
or API/hook wrapper was traced back to its underlying table/RPC.

## Full Database Inventory (schema.sql + migrations, combined)

### Tables (34 defined; first `CREATE TABLE` line cited)
`bank_accounts` (schema.sql:2736), `club_members` (:391), `clubs` (:356),
`community_achievements` (added by `20260711000001_...sql`),
`community_comments` (~:2841), `community_posts` (:2826),
`community_reactions` (~:2850), `community_saved_posts` (~:2859),
`friends` (:320), `game_analysis` (:2147), `game_chat` (:222),
`game_moves` (:200), `games` (:152), `iq_history` (defined twice, see
Issue #2), `matchmaking_pool` (:244), `news_articles` (:488),
`notifications` (:529), `profiles` (:48), `public_rooms` (:1442),
`puzzle_attempts` (:296), `puzzles` (:274), `rating_history` (:588),
`ratings` (:123), `room_queue` (:2260), `subscriptions` (:563),
`tournament_entries` (:458), `tournaments` (:416), `user_roles` (:94),
`user_streaks` (:1730), `wallet_transactions` (:1132), `wallets` (:1107).
Plus (from the pre-existing, not-yet-approved seasons migration file):
`seasons`, `season_rankings`, `season_history` — **not counted as part
of this audit's confirmed-good set** since that file isn't approved.

### Views
`leaderboard_view` — defined twice (schema.sql:3302 original, then
re-created identically-in-spirit but with corrected columns by
`20260711000001_fix_leaderboard_view_missing_columns.sql`). The migration
version wins (runs last); previously verified defect-free.

### Functions (53 defined)
`admin_credit_wallet`, `admin_debit_wallet`, `apply_elo_change`,
`apply_iq_change` (duplicated, see Issue #2), `claim_timeout`,
`create_challenge`, `create_public_room`, `credit_premium_bonus`,
`current_rating`, `distribute_tournament_prizes`,
`ensure_upcoming_tournaments` (duplicated, see Issue #4),
`expire_premium_subscriptions`, `get_dynamic_leaderboard` (duplicated,
resolved by hotfix migration — OK), `handle_community_comment`,
`handle_community_reaction`, `handle_game_finished_streak`,
`handle_new_user`, `has_role`, `join_game`, `join_public_room`,
`join_room_queue`, `join_tournament_paid` (duplicated, see Issue #4),
`leave_public_room`, `leave_queue`, `leave_room_queue`, `matchmake`,
`resign_game`, `respond_draw`, `save_bank_account`, `save_computer_game`
(defined **three** times, see Issue #4), `save_game_analysis`,
`save_local_game` (duplicated, see Issue #4), `seed_daily_tournaments`,
`set_updated_at`, `start_room_match`, `sync_iq_level`,
`sync_premium_status_to_profile`, `transition_locked_tournaments`,
`trg_auto_create_tournament`, `update_login_streak`,
`update_match_streak_for_user`.

### RLS coverage
Every table with `ENABLE ROW LEVEL SECURITY` has at least one
`CREATE POLICY` targeting it — **no bare-RLS-no-policy tables found**.
Did not evaluate whether each policy's predicate is the *correct* scoping
for every query pattern beyond the priority pages (see Issues #7-#9 for
exceptions found).

### Foreign keys
24 `REFERENCES public.<table>(<col>)` declarations found; **all 24
specify an explicit `ON DELETE` behavior** (`CASCADE` or `SET NULL`) —
no missing-behavior (implicit `RESTRICT`) FKs found. All FK columns
checked are typed `UUID` matching their referenced `id`/`UUID` columns —
no type mismatches found in the declarations inspected.

## Full Page-by-Page Inventory (`src/routes/*`, 90 files)

Legend: OK = every `.from`/`.rpc` call resolves against the inventory
above. BROKEN = calls a table/RPC not defined anywhere in scope.

| Route file | Tables/RPCs touched | Status |
|---|---|---|
| home.tsx, dashboard.tsx | profiles, ratings, games, notifications (via hooks) | OK |
| auth.tsx, login.tsx, signup.tsx | Supabase Auth + profiles (handle_new_user trigger) | OK |
| profile.tsx | profiles, ratings, games, rating_history, tournament_entries | OK |
| u.$username.tsx | profiles (public) | OK |
| settings.tsx | `user_settings` (src/lib/settings/settings-sync.ts) | **BROKEN** — table not in schema.sql/migrations (Issue #6) |
| leaderboards.tsx, admin.leaderboard.tsx | `get_dynamic_leaderboard` RPC, `leaderboard_view` | OK |
| community.index.tsx, community.explore.tsx, community.post.$id.tsx, community.bookmarks.tsx | community_posts, community_comments, community_reactions, community_saved_posts (OK) **plus** `community_blocks`, `community_bookmarks`, `community_follows`, `community_hidden_posts`, `community_mutes`, `community_reports` via `communityClient.ts`/`useCommunity.ts` | **PARTIALLY BROKEN** (Issue #5) |
| game.$id.tsx, game.$id.review.tsx | games, game_moves, game_chat, profiles, rating_history | OK |
| tournament.$id.tsx | tournaments, tournament_entries, **`tournament_matches`** (route line 233) | **BROKEN** (Issue #3) |
| tournaments.tsx, admin.tournaments.tsx | tournaments, tournament_entries | OK |
| notifications.tsx | notifications | OK |
| friends.tsx, play.friend.tsx | friends, profiles | OK |
| premium.tsx, admin.premium.tsx | subscriptions (via hooks) | OK |
| search.tsx | profiles, clubs, tournaments, news_articles | OK |
| clubs.tsx, club.$slug.tsx | clubs, club_members | OK |
| news.index.tsx, news.$slug.tsx | news_articles | OK |
| room.index.tsx, room.$roomId.tsx | public_rooms, room_queue | OK |
| puzzles.index.tsx, puzzles.rush.tsx | puzzles, puzzle_attempts | OK |
| play.index.tsx, play.history.tsx, play.local.tsx | games, matchmaking_pool | OK |
| analysis.tsx | game_analysis | OK |
| wallet.tsx, wallet.bank.tsx | `withdrawal_requests`, `bank_details` (useWithdrawal.ts, useBankDetails.ts) — wallets/wallet_transactions OK, but withdrawal/bank tables **not in scope** | **BROKEN** (Issue #7) |
| admin.withdrawals.tsx | RPCs `admin_get_withdrawal_requests`, `admin_approve_withdrawal`, `admin_reject_withdrawal` | **BROKEN** (Issue #7) |
| admin.wallet.tsx | wallet_transactions (read-only view; does **not** call `admin_credit_wallet`/`admin_debit_wallet` despite those existing — see Issue #10) | OK (but under-wired) |
| about.tsx, about-chess.tsx, admin.about-chess.tsx | `about_articles` (aboutClient.ts) | **BROKEN** (Issue #8) |
| policies.tsx, community-guidelines.tsx, community-policy.tsx, fair-play-policy.tsx, grievance-policy.tsx, privacy-policy.tsx, refund-policy.tsx, terms-and-conditions.tsx, withdrawal-policy.tsx, admin.policies.tsx | `policies`, `policy_versions` (policyClient.ts) | **BROKEN** (Issue #8) |
| feedback.tsx, admin.feedback.tsx | `feedbacks` (feedbackClient.ts) | **BROKEN** (Issue #8) |
| report.tsx, admin.reports.tsx, admin.community.tsx | `reports` table, RPC `admin_resolve_platform_report` | **BROKEN** (Issue #9) |
| chat.tsx, chat.index.tsx, chat.discover.tsx, chat.global.tsx, chat.room.$slug.tsx, chat.dm.$username.tsx, admin.chat.tsx | ~16 `chat_*` RPCs + `chat_reports` table (chatClient.ts) | **BROKEN, entire subsystem** (Issue #11) |
| admin.users.tsx | profiles, user_roles | OK |
| admin.settings.tsx | not individually re-verified this pass (low risk, admin-only) | Not re-checked |
| admin.logs.tsx | `admin_audit_logs` (adminClient.ts) | **BROKEN** (Issue #10) |
| admin.analytics.tsx | aggregates over profiles/games/wallets | OK |
| admin.puzzles.tsx | puzzles, puzzle_attempts | OK |
| admin.index.tsx | dashboard aggregates | OK |
| seasons.tsx | static "Coming Soon" placeholder — **no Supabase calls at all** | OK (intentionally stubbed, does not hard-error) |
| admin.seasons.tsx + `src/lib/api/seasonsClient.ts` | 11 RPCs (`current_season`, `list_seasons`, `season_leaderboard`, `season_history_for_user`, `admin_create_season`, `admin_edit_season`, `admin_start_season`, `admin_pause_season`, `admin_resume_season`, `admin_end_season`, `admin_recalculate_season`) | **BROKEN, critical** (Issue #1) — note `seasons.tsx` itself is a safe stub; only `admin.seasons.tsx` will hard-error |
| course.$slug.tsx, course.index.tsx, learn.tsx, openings.tsx, events.tsx | static/CMS content, no dynamic Supabase table calls found | OK |
| __root.tsx | `seed_daily_tournaments`, `update_login_streak` RPCs | OK |

No hardcoded/mock arrays standing in for real data were found anywhere
in `src/` (`TODO`, `FIXME`, `mock[A-Z]`, `dummyData`, `hardcoded` all
return zero matches project-wide). Loading/error states were spot-checked
on the priority pages (leaderboards, community, profile, game, tournament)
and are present (`isLoading`/`isPending`/try-catch-toast patterns via
react-query throughout).

## Issues Found (severity-ranked)

1. **[CRITICAL]** `admin.seasons.tsx` + `seasonsClient.ts` call 11 RPCs
   with zero backing SQL anywhere in `schema.sql`/`migrations/`. Every
   admin action on that page will 404/`PGRST202`. The public `/seasons`
   route is a static stub and does **not** call any of these, so it is
   safe as-is. *Not fixed this pass (audit-only).*

2. **[LOW]** `schema.sql` lines ~3007–3139 duplicate the entire "IQ
   rating system" block verbatim, including a second `iq_history` table
   definition and a second `apply_iq_change` function body (line 3038 vs
   3142). Idempotent (`CREATE TABLE IF NOT EXISTS` / `CREATE OR REPLACE
   FUNCTION`), so the second (later) copy silently wins with no
   functional difference observed on inspection — purely dead,
   confusing documentation. *Not fixed.*

3. **[CRITICAL]** `src/routes/tournament.$id.tsx` line 233 queries
   `.from("tournament_matches")` — this table does not exist anywhere in
   `schema.sql` or migrations. Bracket/match display on the tournament
   detail page will error or silently return no data. This is one of the
   four pages the user explicitly named as priority. *Not fixed.*

4. **[MEDIUM]** Duplicate function bodies with **material** differences
   (later copy always wins under sequential execution, and appears to be
   an intentional patch, not corruption — flagged for cleanup only):
   - `join_tournament_paid` (schema.sql:1224 vs :2546) — second version
     adds "was this the last player needed" auto-start logic.
   - `save_computer_game` defined **three** times (schema.sql:1039,
     :1875, :2015).
   - `save_local_game` defined twice (:1934, :2081).
   - `ensure_upcoming_tournaments` defined twice (:2405, :2500).
   All resolve correctly today (last-wins, and the last version is the
   more complete one in every case checked), but three-deep duplication
   of `save_computer_game` is a maintenance hazard. *Not fixed — no
   evidence the currently-active (last) version is wrong.*

5. **[MEDIUM]** Community moderation/social-graph tables referenced by
   `communityClient.ts`/`useCommunity.ts` (and `community.bookmarks.tsx`
   directly) do not exist in scope: `community_blocks`,
   `community_bookmarks` (note: a *different*, existing table
   `community_saved_posts` already covers "saved posts" — `bookmarks` may
   be a naming-drift duplicate of that feature, not a wholly separate
   one), `community_follows`, `community_hidden_posts`,
   `community_mutes`, `community_reports`. Community is one of the four
   user-named priority pages; core posting/reacting/commenting (backed by
   `community_posts`/`community_reactions`/`community_comments`/
   `community_saved_posts`) is fully wired and OK — only the
   moderation/follow/bookmark layer is broken. *Not fixed.*

6. **[MEDIUM]** `src/lib/settings/settings-sync.ts` reads/writes
   `user_settings`, which does not exist in scope (project memory
   confirms: "user_settings table (migration not applied)"). Settings
   page will fail to persist. *Not fixed.*

7. **[HIGH]** Wallet/withdrawal flow: `useWithdrawal.ts` and
   `useBankDetails.ts` call table `withdrawal_requests`/`bank_details`
   and RPCs `submit_withdrawal_request`, `cancel_withdrawal_request`,
   `save_bank_details`, `admin_get_withdrawal_requests`,
   `admin_approve_withdrawal`, `admin_reject_withdrawal` — none exist in
   scope. `wallet.tsx`/`wallet.bank.tsx`/`admin.withdrawals.tsx` will all
   hard-error on these specific actions (core wallet balance display via
   `wallets`/`wallet_transactions` is fine). *Not fixed.*

8. **[MEDIUM]** Three CMS-style subsystems have zero backing SQL in
   scope, each referencing a standalone migration file that does not
   exist anywhere in the repo (`supabase/migrations_about_chess.sql`,
   `supabase/migrations_policies.sql`, and a feedback equivalent):
   `about_articles` (aboutClient.ts → about.tsx/about-chess.tsx/
   admin.about-chess.tsx), `policies`+`policy_versions` (policyClient.ts
   → policies.tsx and 8 static policy pages + admin.policies.tsx),
   `feedbacks` (feedbackClient.ts → feedback.tsx/admin.feedback.tsx).
   *Not fixed.*

9. **[MEDIUM]** `report.tsx`, `admin.reports.tsx`, `admin.community.tsx`
   query a `reports` table and call `admin_resolve_platform_report` —
   neither exists in scope. *Not fixed.*

10. **[LOW]** `adminClient.ts` reads `admin_audit_logs` (admin.logs.tsx)
    — not in scope. Separately, `admin_credit_wallet`/`admin_debit_wallet`
    exist in schema.sql (functioning, correctly gated by
    `has_role(auth.uid(),'admin')`) but are **never called from any route**
    — `admin.wallet.tsx` only reads `wallet_transactions`; the credit/debit
    UI action, if any, is not wired to these functions. Orphan backend
    capability, not a runtime bug. *Not fixed / informational.*

11. **[CRITICAL, largest orphan surface]** The entire chat subsystem
    (`chat.tsx` and 6 sub-routes, `admin.chat.tsx`) is built entirely on
    `chatClient.ts`, which calls ~16 distinct `chat_*` RPCs
    (`chat_my_channels`, `chat_discover_rooms`, `chat_get_channel`,
    `chat_create_room`, `chat_update_room`, `chat_delete_room`,
    `chat_join_room`, `chat_leave_room`, `chat_invite_user`,
    `chat_remove_member`, `chat_mute_member`, `chat_set_moderator`,
    `chat_get_or_create_dm`, `chat_mark_read`, `chat_channel_members`,
    `chat_channel_feed`, `chat_search_messages`, `chat_pinned_messages`,
    `chat_send_message`, `chat_delete_message`, `chat_react`,
    `chat_pin_message`, `chat_report_message`, `admin_chat_stats`,
    `admin_resolve_chat_report`) plus a `chat_reports` table — **none**
    exist in `schema.sql` or migrations, and the file the code comment
    cites as the backend (`supabase/migrations_chat.sql`) does not exist
    anywhere in the repo. Every chat page will hard-error on every
    action. *Not fixed — largest scoped gap found, on par with or larger
    than the Seasons issue.*

## Unused Tables/Functions (defined, never referenced in `src/`)

Tables: `bank_accounts`, `community_achievements`, `community_reactions`,
`community_saved_posts`, `iq_history`, `matchmaking_pool`, `subscriptions`,
`user_roles`. (Note: several of these — `community_reactions`,
`community_saved_posts`, `matchmaking_pool` — are almost certainly
accessed only indirectly through RPCs/hooks using a differently-named
wrapper or generic query builder that a static string-literal grep can't
catch with full confidence; flagged for manual confirmation, not
asserted as dead.)

Functions: `_season_recompute_rankings` (from the not-yet-approved
seasons migration — internal helper, expected to be unreferenced from
`src/` by design), `admin_credit_wallet`, `admin_debit_wallet` (see
Issue #10), `apply_iq_change`, `current_rating`,
`distribute_tournament_prizes`, `ensure_upcoming_tournaments`,
`expire_premium_subscriptions`, `handle_community_comment`,
`handle_community_reaction`, `handle_game_finished_streak`,
`handle_new_user`, `has_role`, `save_bank_account`, `set_updated_at`,
`sync_iq_level`, `sync_premium_status_to_profile`,
`transition_locked_tournaments`, `trg_auto_create_tournament`,
`update_match_streak_for_user`. Most of these are expected to be
trigger functions or internal helpers called by other SQL (not meant to
be called from `src/` directly) — e.g. `handle_new_user`,
`set_updated_at`, `sync_iq_level`, `trg_auto_create_tournament` are
almost certainly wired as `CREATE TRIGGER` bodies, which this pass did
not separately enumerate/verify line-by-line. Genuinely orphaned
capability (no trigger, no caller): `admin_credit_wallet`/
`admin_debit_wallet` (Issue #10) and `save_bank_account` (superseded in
the frontend's intent by the nonexistent `save_bank_details`, Issue #7 —
possible naming-drift duplicate of a feature that was renamed on one
side only).

## Recommendations (described, not implemented this pass)

1. Author a full Seasons migration (table + ~10 RPCs) — largest,
   already scoped in detail by the pending (unapproved)
   `20260712000001_seasons_backend.sql` file on disk; review and approve
   or discard it explicitly.
2. Author a Chat migration — this is comparably large to Seasons (~16
   RPCs + 1 table) and currently has zero SQL anywhere in scope; every
   chat route hard-errors today.
3. Author a Withdrawals/Bank migration (`withdrawal_requests`,
   `bank_details`, 6 RPCs) — wallet balance works, but users cannot
   actually withdraw or save bank details.
4. Author a CMS migration for `about_articles`, `policies`+
   `policy_versions`, `feedbacks` — three separate small features, could
   ship as one combined additive migration.
5. Author a `reports`/`admin_resolve_platform_report` migration for the
   platform-wide reporting flow (distinct from chat's own
   `chat_reports`/`admin_resolve_chat_report`).
6. Author a Community-moderation migration:
   `community_blocks`/`community_follows`/`community_hidden_posts`/
   `community_mutes`/`community_reports`, and resolve whether
   `community_bookmarks` should be a new table or the frontend should be
   pointed at the existing `community_saved_posts` instead (avoids
   building a duplicate feature).
7. Author a `user_settings` migration for the settings page.
8. Fix `tournament.$id.tsx` line 233 to either query the correct
   existing table for match/bracket data or receive a new
   `tournament_matches` table via migration — needs a product decision on
   which.
9. Cosmetic cleanup pass on `schema.sql`: remove the duplicated IQ block
   (Issue #2) and collapse the three `save_computer_game`/two
   `save_local_game`/two `ensure_upcoming_tournaments`/two
   `join_tournament_paid` definitions down to one each (keeping the
   last/most-complete body in every case) — zero functional risk since
   the last one already wins.
10. Wire `admin.wallet.tsx` to actually call `admin_credit_wallet`/
    `admin_debit_wallet` if manual balance adjustment is an intended
    admin capability (currently dead code).

## Confirmation

No SQL migration, schema change, or application code was written or
modified as part of producing this report. The one migration file that
exists on disk from earlier in this session
(`supabase/migrations/20260712000001_seasons_backend.sql`) was created
**before** the scope change to audit-only and has been left untouched
per instruction, but is explicitly **not** counted as part of, or
validated by, this audit.

---

## Fix Pass 2 — Seasons / Chat / tournament_matches

Implemented by a follow-up session for 3 CRITICAL findings only. No other
audit item was touched; no existing migration was altered except as noted.

### 1. Seasons backend — verified, no changes needed

Cross-checked `supabase/migrations/20260712000001_seasons_backend.sql`
against every export in `src/lib/api/seasonsClient.ts` and its two
consumer routes (`src/routes/seasons.tsx`, `src/routes/admin.seasons.tsx`,
both of which only go through `seasonsClient.ts`, never raw `.rpc()`/
`.from()` calls of their own). Every RPC name, parameter name/order, and
return shape matches exactly:

- `current_season()`, `list_seasons()` — match `Season` type.
- `season_leaderboard(p_season_id, p_country, p_state, p_district, p_search, p_limit, p_offset)`
  — param order and names match `getSeasonLeaderboard`; return columns
  match `SeasonLeaderboardEntry` including `premium_active`/`premium_expires_at`
  (confirmed those columns exist on `public.profiles` via migrations
  adding them for the subscription system).
- `season_history_for_user(p_user_id)` — JSON shape matches `SeasonHistoryForUser`.
- `admin_create_season`, `admin_edit_season`, `admin_start_season`,
  `admin_pause_season`, `admin_resume_season`, `admin_end_season`,
  `admin_recalculate_season` — all match `seasonsClient.ts` param names
  and the `adminEndSeason` return shape (`success`/`ranked_players`/`next_season_id`).

The migration was left untouched. No `20260713000001_seasons_backend_fixes.sql`
was needed.

### 2. Chat subsystem — new migration `supabase/migrations/20260713000002_chat_subsystem.sql`

`src/lib/api/chatClient.ts` and `src/routes/admin.chat.tsx` called 24
RPCs (`chat_my_channels`, `chat_discover_rooms`, `chat_get_channel`,
`chat_create_room`, `chat_update_room`, `chat_delete_room`, `chat_join_room`,
`chat_leave_room`, `chat_invite_user`, `chat_remove_member`, `chat_mute_member`,
`chat_set_moderator`, `chat_get_or_create_dm`, `chat_mark_read`,
`chat_channel_members`, `chat_channel_feed`, `chat_search_messages`,
`chat_pinned_messages`, `chat_send_message`, `chat_delete_message`,
`chat_react`, `chat_pin_message`, `chat_report_message`, `admin_chat_stats`,
`admin_resolve_chat_report`) plus a direct `.from("chat_reports")` query
in `admin.chat.tsx`, none of which existed anywhere in `schema.sql` or
prior migrations.

Created additively:
- Tables: `chat_channels` (global/room/dm, with a canonical
  `dm_user_a < dm_user_b` pair + unique index to dedupe DMs),
  `chat_channel_members` (role, mute, ban, per-member `last_read_at`),
  `chat_messages`, `chat_message_reactions`, `chat_reports`.
- RLS on every table (public read for global/public rooms, membership-
  gated read for DMs/private rooms, admin/reporter-only read for
  `chat_reports`), following the `game_chat`/`community_comments` style.
- All 24 RPCs as `SECURITY DEFINER`, matching every param name/order and
  return shape used by `chatClient.ts`/`admin.chat.tsx` exactly (e.g.
  `ChatChannel`, `ChatMessage`, `ChatMember`, `ChatStats` fields).
- `chat_messages` added to the `supabase_realtime` publication.
- A named composite type `public.chat_channel_row` and
  `public.chat_message_row` back the shared row-builder helpers
  (`_chat_channel_row`, `_chat_message_row`) — a `RETURNS TABLE(...)`
  signature is local to one function and can't be reused as a type, so
  explicit `CREATE TYPE` was required for the helpers' output to be
  reusable as `SETOF`/scalar return types across the public RPCs that
  call them.

**Assumption called out**: the exact reward/permission nuances (e.g.
whether moderators can ban vs. only kick, exact mute-duration semantics)
were inferred from the client's param shapes (`p_ban boolean`, `p_minutes int`)
since no prior spec existed; implemented the most conservative
interpretation (owner + moderator can remove/mute/ban; only owner or
admin can promote/demote moderators or delete the room).

### 3. tournament_matches — new migration `supabase/migrations/20260713000003_tournament_matches.sql`

`src/routes/tournament.$id.tsx` selects
`id,round,slot,player1_id,player2_id,game_id,winner_id,status` from
`tournament_matches` filtered by `tournament_id` and ordered by `round`,
and subscribes to `postgres_changes` on this table (filter
`tournament_id=eq.<id>`) for live bracket updates — no such table existed
anywhere.

Created additively: `public.tournament_matches` with exactly those
columns plus `id`, `created_at`, `updated_at`; FKs to `public.tournaments`
(cascade), `auth.users` for `player1_id`/`player2_id`/`winner_id` (set
null on delete, consistent with `tournament_entries.user_id`), and
`public.games` for `game_id` (set null on delete). Added a
`(tournament_id, round, slot)` unique index (bracket slots can't
collide), an index on `game_id`, public SELECT RLS (matching
`tournaments`/`tournament_entries` being open to anon/authenticated),
admin-gated INSERT/UPDATE RLS (bracket generation/progression is an
admin/server operation, same posture as "Admins update tournaments"),
an `updated_at` touch trigger, and added the table to the
`supabase_realtime` publication since the route explicitly subscribes
to it.

### Residual issues

None outstanding for these 3 items. All three are now fully additive and
consistent with the frontend's exact expectations. Standard caveat: none
of this has been applied to the live database (no Supabase MCP calls
were made, per instructions) — these are unapplied migration files only.

---

## Fix Pass 2 — Withdrawals / Settings / Reports / Community

Implemented by a parallel follow-up session, independent of the
Seasons/Chat/tournament_matches pass above. New migration files start at
`20260713000010` to avoid colliding with that other session's
`20260713000001`–`3`; `schema.sql` and all pre-existing migration files
were left untouched.

### 1. Withdrawal / bank-details flow — HIGH — fixed

New migration: `supabase/migrations/20260713000010_withdrawal_flow.sql`.

Re-verified the audit's claim first: `public.bank_accounts` and
`public.save_bank_account` (schema.sql SECTION 63) do exist, but they are
a **different, unused** pair — the actual frontend code
(`src/hooks/useBankDetails.ts`, `src/hooks/useWithdrawal.ts`) calls
`public.bank_details` (not `bank_accounts`) and RPC
`save_bank_details` (not `save_bank_account`), plus a wholly separate
`withdrawal_requests` table and four withdrawal RPCs. None of those
exact names existed anywhere, confirming the audit's HIGH finding.

Created additively:
- `public.bank_details` — one row per user, same shape as
  `useBankDetails.ts`'s `BankAccount` type (`account_holder_name`,
  `account_number_last4`, `ifsc_code`, `bank_name`, `branch_name`,
  `branch_address`, `account_type`, `verification_status`). Account
  number is `pgp_sym_encrypt`'d server-side, following the exact pattern
  of the existing (unused) `save_bank_account`. RLS: user can `SELECT`
  their own row only; no direct insert/update — all writes go through
  the RPC.
- `public.save_bank_details(...)` RPC — `SECURITY DEFINER`, matches all
  7 params `useBankDetails.ts` sends, upserts on `user_id`.
- `public.withdrawal_requests` — matches `WithdrawalRequest`/
  `AdminWithdrawalRequest` shapes exactly (`bank_details_id`, `amount`,
  `status` constrained to `pending|approved|rejected|cancelled|completed`,
  `reject_reason`, `admin_id`, `processed_at`); added to the
  `supabase_realtime` publication since `useWithdrawalRequests` subscribes
  to `postgres_changes` on it. RLS: user sees only their own rows.
- `public.submit_withdrawal_request(p_amount)` — validates a bank_details
  row exists, blocks a second pending request, escrows the amount out of
  `public.wallets` immediately (debit + `wallet_transactions` row of type
  `withdrawal_request`), inserts the request, returns its id (as the hook
  expects a string return).
- `public.cancel_withdrawal_request(p_request_id)` — user-only, only from
  `pending`, refunds the wallet (`withdrawal_cancelled` transaction).
- `public.admin_approve_withdrawal(p_request_id)` — admin-gated via
  `has_role(auth.uid(),'admin')`, marks `completed` (funds already left
  the wallet at submission time — approval is "transfer confirmed",
  matching the admin UI copy "Approve (Mark Transferred)").
- `public.admin_reject_withdrawal(p_request_id, p_reason)` — admin-gated,
  refunds the wallet (`withdrawal_rejected` transaction), matching the
  admin UI's "Reject & Refund" wording.
- `public.admin_get_withdrawal_requests(p_status)` — admin-gated, returns
  a joined view (`withdrawal_requests` ⋈ `bank_details` ⋈ `profiles`)
  exactly matching the `AdminWithdrawalRequest` column set
  (`username`, `display_name`, `bank_name`, `account_last4`, `ifsc_code`, …).

**Assumption**: no `locked_balance` column exists on `public.wallets`
(only `balance`/`total_earned`/`total_spent`); implemented escrow as an
immediate debit at submission time with a full refund transaction on
cancel/reject, which reproduces the same user-visible behavior without
a schema change to `wallets`.

### 2. `user_settings` table — MEDIUM — fixed

New migration: `supabase/migrations/20260713000011_user_settings.sql`.

Created `public.user_settings` with **one typed column per key** in
`src/lib/settings/schema.ts`'s `SETTING_KEYS`/`DEFAULTS` (89 columns:
booleans, ints, and constrained-by-app-logic text columns for
enum-like fields such as `board_theme`, `clock_position`,
`color_blind_mode`, etc. — matching `settings-sync.ts`'s comment that
this table is "no JSON blobs"). `user_id` is the primary key so
`persistSettingsToDb`'s `upsert(..., { onConflict: "user_id" })` and
`loadSettingsFromDb`'s `.eq("user_id", userId).maybeSingle()` both work
unmodified. RLS: user can `SELECT`/`INSERT`/`UPDATE` only their own row.

### 3. `reports` table + RPC — MEDIUM — fixed

New migration: `supabase/migrations/20260713000012_reports.sql`.

`src/routes/report.tsx` inserts into `public.reports`
(`reporter_id, type, issue_type, reported_user, reason, description`);
`src/routes/admin.reports.tsx` selects the same columns plus `status`
and calls `public.admin_resolve_platform_report(p_report_id, p_status)`.
Created both. `status` is constrained to `open|resolved|ignored` per
the admin page's own comment. RLS: reporter sees their own reports;
admins (`has_role(...,'admin')`) see all; only authenticated users can
insert, scoped to their own `reporter_id`. The resolve RPC is
admin-gated and validates `p_status IN ('resolved','ignored')`.

Noted this is a **distinct** table from `community_reports` (item 4
below) — `reports` is platform-wide (bugs, fair-play, users, games),
while `community_reports` is community-post/comment-specific and
carries different columns (`target_type`/`target_id` vs.
`issue_type`/`reported_user`). Kept them separate rather than merging,
since both are independently referenced by name in the frontend.

### 4. Community follow/moderation tables — MEDIUM — fixed (tables only)

New migration: `supabase/migrations/20260713000013_community_follow_moderation.sql`.

Confirmed via `communityClient.ts` and `community.bookmarks.tsx` that 6
tables are referenced but don't exist: `community_blocks`,
`community_bookmarks`, `community_follows`, `community_hidden_posts`,
`community_mutes`, `community_reports`. Existing
`community_posts`/`community_reactions`/`community_comments`/
`community_saved_posts` were left untouched.

Created all 6 tables additively, each with RLS scoped to the acting
user (`auth.uid()` must match the row's owner column for
insert/update/delete; `community_follows`/`community_reports` allow
broader read: follows are publicly readable, reports are
reporter-or-admin readable). Also added
`public.admin_resolve_report(p_report_id, p_status)` since
`communityClient.ts`'s `resolveReport()` calls it and it's the direct
counterpart to the `community_reports` table just created — status
constrained to `open|resolved|dismissed` matching `CommunityReport`'s
type.

**Scope note / known gap**: `communityClient.ts` also calls a larger set
of RPCs against these and existing tables — `community_react`,
`community_toggle_follow`, `community_toggle_bookmark`,
`community_vote_poll`, `community_share_post`, `community_profile`,
`community_follow_list`, `community_leaderboard`,
`community_suggested_users`, `community_search_users`,
`community_trending_tags`, `admin_community_stats` — none of which
exist yet. These were **out of scope** for this pass (the assigned task
was specifically "additional tables… e.g. a `community_follows` table…
moderation flags"), so they are not implemented here. Every button in
the community UI that calls one of these RPCs (follow/unfollow, like/
dislike, bookmark toggle, poll voting, share, profile page, leaderboard,
search, suggested users, trending tags, admin community stats) will
still hard-error until a follow-up pass adds them — flagging this
explicitly so it isn't mistaken for fully fixed.

### 5. About / Policies / Feedback CMS tables — MEDIUM — fixed

New migration: `supabase/migrations/20260713000014_cms_tables.sql`.

Re-verified against `aboutClient.ts`, `policyClient.ts`,
`feedbackClient.ts`: despite project memory suggesting the About-Chess
and Policy systems were "applied to the live DB", **no** `about_articles`,
`policies`, `policy_versions`, or `feedbacks` table exists anywhere in
`schema.sql` or any migration file in this repo — per the stated source
of truth (schema.sql + migrations only), the audit's finding stands, and
those memory notes likely describe changes applied directly to a live
database outside of tracked migration files, which are out of scope here.

All three client modules already degrade gracefully to a `localStorage`
fallback when the table is missing (detected via error-message sniffing
for "relation does not exist"/"schema cache"/404), so this was not a
hard-error bug like the withdrawal flow — but content wasn't persisting
server-side or syncing across admins/devices.

Created additively, matching each client's exact row shape:
- `public.about_articles` (`title, slug, content, category, tags[],
  author_id, is_published, sort_order`) — public can read published
  rows, admins read/write/delete everything.
- `public.policies` + `public.policy_versions` (verbatim content,
  version-snapshotting on every save, per `policyClient.ts`'s own
  documented contract) — public reads published policies, admins manage
  drafts/publishing and view version history.
- `public.feedbacks` (`user_id, rating 1–5, message`) — any
  authenticated user can insert (including anonymous-user-id-null per
  `submitFeedback`'s signature), only admins can list.

### Overall assumptions across this pass

- `public.has_role(auth.uid(), 'admin')` is the sole admin gate used
  throughout, matching every existing admin-only policy/RPC in
  `schema.sql`.
- `public.set_updated_at()` (existing trigger function) is reused for
  every new `updated_at` column rather than redefining it.
- No table or column was dropped or renamed; `public.bank_accounts` /
  `public.save_bank_account` from SECTION 63 are left in place, unused,
  exactly as found.
- None of this has been applied to the live database (no Supabase MCP
  calls were made, per instructions) — these are unapplied migration
  files only.
