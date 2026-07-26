# ChessOX — "Play with Friend" Direct Challenge System

**Production Architecture Specification — v1.0 (2026-07-18)**

This document specifies the complete architecture for a Chess.com-style direct
challenge system, adapted to ChessOX's existing stack. It contains **no code**;
every table, RPC, channel, state, and UI behavior is specified precisely enough
to be implemented exactly as written.

---

## 0. Existing Foundation (what this builds on)

ChessOX already has, and this design deliberately reuses:

| Existing piece | Role in this system |
|---|---|
| `games`, `game_moves`, `game_chat` tables | The game itself — unchanged as the source of truth |
| `create_challenge` / `join_game` RPCs | Link-based flow; kept for invite links, superseded for direct challenges |
| `makeMove` server function (chess.js validation, service role commit) | The only write path for moves — unchanged |
| `resign_game`, `respond_draw`, `claim_timeout` RPCs | Game-end paths — unchanged |
| `game:${id}` realtime channel (postgres_changes on games/game_moves/game_chat) | In-game sync — extended with a broadcast/presence layer |
| `profiles.is_online` + 60s heartbeat (`src/lib/presence.ts`) | Coarse presence — upgraded (Section 3) |
| `friends`, `community_follows`, `community_blocks`, `community_mutes`, `clan_members` | Relationship checks for challenge eligibility |
| `notifications` table + `useNotificationCount` | Persistent notification record |
| `__root.tsx` auth bootstrap | Mount point for the new global challenge listener |

**The one genuinely new domain object is the `challenges` table** plus its RPCs,
a global realtime listener, and the UI around them. The game lifecycle after
"accept" is the existing game lifecycle.

---

## 1. Top-Level Architecture

```
┌────────────────────────── CLIENT (TanStack SPA) ──────────────────────────┐
│                                                                           │
│  __root.tsx                                                               │
│   ├─ AuthProvider (existing)                                              │
│   ├─ PresenceManager (upgraded: Realtime Presence + DB heartbeat)         │
│   └─ ChallengeProvider  ← NEW, global, mounted once, survives navigation  │
│        ├─ subscribes: postgres_changes on challenges (as opponent/sender) │
│        ├─ renders: IncomingChallengeModal, OutgoingChallengeToast         │
│        └─ performs: auto-redirect to /game/$id on accept                  │
│                                                                           │
│  ChallengeButton (shared component, embedded at 7 entry points)           │
│  ChallengeConfigModal (time / increment / color / rated)                  │
│  game.$id.tsx (existing game room, extended: presence, rematch, chat+)    │
└───────────────────────────────────────────────────────────────────────────┘
                    │ RPC (SECURITY DEFINER)        │ Realtime (WebSocket)
                    ▼                               ▼
┌────────────────────────── SUPABASE (Postgres) ────────────────────────────┐
│  challenges table (NEW)         RPCs (NEW):                               │
│  games / game_moves / game_chat   send_challenge                          │
│  notifications                    respond_challenge (accept|decline)      │
│  profiles (presence columns)      cancel_challenge                        │
│                                   expire_stale_challenges (cron)          │
│                                   request_rematch (thin wrapper)          │
│  makeMove server fn (existing, service-role, chess.js authority)          │
└───────────────────────────────────────────────────────────────────────────┘
```

**Design principles**

1. **Database is the single source of truth.** Realtime events are *signals to
   re-render*, never the authority. Every screen must be reconstructible from a
   plain SELECT after refresh.
2. **All state transitions go through SECURITY DEFINER RPCs** that lock rows,
   re-validate, and commit atomically. The client can never write `challenges`
   or `games` directly (RLS grants SELECT only).
3. **Realtime = postgres_changes for durable state, broadcast/presence for
   ephemeral state** (typing indicators, live countdown sync, connection
   status). Nothing ephemeral touches the database.
4. **Every popup is idempotent and reconcilable**: on mount and on every
   realtime reconnect, the client re-fetches the challenge row and reconciles.

---

## 2. Database Design

### 2.1 `challenges` table (new schema section)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK, `gen_random_uuid()` | Challenge identity |
| `challenger_id` | UUID NOT NULL → auth.users, ON DELETE CASCADE | Sender |
| `opponent_id` | UUID NOT NULL → auth.users, ON DELETE CASCADE | Receiver |
| `status` | TEXT NOT NULL DEFAULT `'pending'` | `pending · accepted · declined · expired · cancelled` |
| `time_class` | `public.time_class` | Derived server-side from minutes (bullet <3, blitz <10, rapid <30, classical ≥30) |
| `time_control` | TEXT | e.g. `"5+3"` — always derived server-side, never trusted from client |
| `initial_seconds` | INT NOT NULL | Whitelist: 60, 120, 180, 300, 600, 900, 1800 |
| `increment_seconds` | INT NOT NULL | Whitelist: 0, 1, 2, 3, 5, 10 |
| `is_rated` | BOOLEAN NOT NULL |  |
| `challenger_color` | TEXT NOT NULL DEFAULT `'random'` | `w · b · random` — resolved at accept time |
| `variant` | TEXT NOT NULL DEFAULT `'standard'` | Future: `chess960`, `custom` (Section 23) |
| `game_id` | UUID NULL → games | Set only on accept |
| `rematch_of_game_id` | UUID NULL → games | Non-null when this is a rematch challenge |
| `message` | TEXT NULL, CHECK length ≤ 140 | Optional short note (future-ready, hidden in v1 UI) |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() |  |
| `expires_at` | TIMESTAMPTZ NOT NULL DEFAULT now() + 60s | Authoritative expiry — the client timer is cosmetic |
| `responded_at` | TIMESTAMPTZ NULL | Set on accept/decline/cancel/expire |
| CHECK | `challenger_id <> opponent_id` | Self-challenge impossible at the schema level |

**Indexes**

- `idx_challenges_opponent_pending` on `(opponent_id, created_at DESC) WHERE status = 'pending'` — the hot path (incoming popup lookup).
- `idx_challenges_challenger_pending` on `(challenger_id) WHERE status = 'pending'`.
- **Partial unique index** `uniq_challenge_pair_pending` on `(least(challenger_id, opponent_id), greatest(challenger_id, opponent_id)) WHERE status = 'pending'` — makes duplicate pending challenges between the same two players *impossible at the database level*, in either direction, regardless of race conditions.

**RLS**

- SELECT: `auth.uid() IN (challenger_id, opponent_id)`. Nobody else can see a
  challenge — this is also what scopes the realtime `postgres_changes` feed
  (Supabase applies RLS to change events).
- No INSERT/UPDATE/DELETE grants to `authenticated`. All writes go through
  SECURITY DEFINER RPCs. `service_role` gets ALL.
- Add `challenges` to the `supabase_realtime` publication, using the same
  idempotent `pg_publication_tables`-guarded `ALTER PUBLICATION` block the
  schema already uses for `games`/`game_moves`/`notifications`.

### 2.2 `games` table — additive changes only

- New nullable column `challenge_id UUID → challenges` — provenance link, and
  the anchor for "duplicate game" prevention (partial unique index on
  `challenge_id WHERE challenge_id IS NOT NULL`: one challenge can only ever
  produce one game).
- New column `started_at TIMESTAMPTZ NULL` — set by the first `makeMove`
  commit (White's first move). Distinct from `created_at` (accept time).
  Clocks run only when `started_at IS NOT NULL` (Section 11).
  **Note (verified against current schema):** today's `join_game` RPC sets
  `last_move_at = now()` at join time, so White's clock effectively starts
  draining before their first move, and `claim_timeout` could flag a player
  who never moved. The `started_at` design fixes this pre-existing defect:
  the accept transaction leaves `last_move_at = NULL`, and both
  `claim_timeout` and the clock derivation in `makeMove` must treat
  `started_at IS NULL` (equivalently `last_move_at IS NULL`) as "zero time
  consumed" — timeout claims are simply invalid before the first move (the
  60-second abort path covers a no-show White instead).
- New columns `white_disconnected_at` / `black_disconnected_at TIMESTAMPTZ NULL`
  — written by the disconnect-grace flow (Section 13).
- Everything else (fen, pgn, turn, clocks, result, end_reason) already exists.

### 2.3 `profiles` presence columns (existing, semantics tightened)

- `is_online BOOLEAN`, `last_seen TIMESTAMPTZ` remain, but **"online" is
  defined as `last_seen > now() - interval '90 seconds'`**, never `is_online`
  alone (a killed tab never fires `beforeunload`). Every server-side check and
  every client online-dot uses this derived definition.
- New column `current_game_id UUID NULL` — set on game create, cleared on game
  end (by the same RPCs/server fn that transition game status). This is what
  makes "player is already in a game" an O(1) indexed check instead of a scan
  of active games.

### 2.4 Permanent record (requirement §19)

Everything survives refresh because everything durable is a row:

| Fact | Where it lives |
|---|---|
| Challenge + status + timestamps | `challenges` |
| Players, colors, ratings at game time | `games` (white_id/black_id/white_rating/black_rating snapshot) |
| Move history / PGN / FEN | `game_moves` (per-ply, with `fen_after`, `time_left_ms`) + `games.pgn/fen` |
| Winner / loser / result / reason | `games.winner_id`, `result`, `end_reason` |
| Durations | `games.created_at`, `started_at`, `ended_at` |
| Rating changes | `rating_history` (existing) |
| Reconnect/disconnect events | `games.*_disconnected_at` + a `game_events` append-only table (Section 13.4) |
| Chat | `game_chat` |

---

## 3. Presence Architecture (prerequisite)

The 60-second DB heartbeat is too coarse for "Challenge only when online" and
useless for in-game connection status. Two layers, cheapest one first:

**Layer 1 — Global online status (drives Challenge button visibility).**
Keep the DB heartbeat exactly as-is, but shorten the write interval to 30s and
define online as `last_seen > now() - 90s` (two missed beats). Lists that show
online dots (friends, clan members, search) already fetch profiles; they add
`last_seen` to the select and compute the dot client-side, refreshing on a 30s
interval plus a `postgres_changes` subscription on the visible profiles is
*not* used (too chatty) — polling the visible list is sufficient and bounded.

**Layer 2 — Supabase Realtime Presence channel `presence:lobby`.**
Every authenticated session joins one shared presence channel on login,
tracking `{ user_id, at }`. This gives instant join/leave events for the
people currently on screen. UI treats Layer 2 as an *upgrade*: dot = green if
present in the presence state **or** fresh per Layer 1. Layer 1 is the
fallback when the websocket is down, and the *server* only ever trusts Layer 1
(RPCs cannot see presence channels).

**In-game presence** is a separate per-game channel (Section 13).

---

## 4. Challenge Entry Points (requirement §1)

One shared component, `ChallengeButton`, rendered with a `targetUserId` +
`targetProfile` wherever a real user appears:

| Surface | Location in app |
|---|---|
| Friend list | `friends.tsx` rows |
| User profile | `u.$username.tsx` header, next to Follow/Message |
| Followers / Following lists | the follow lists rendered from `community_follows` |
| Community profile hovercards / post authors | `useCommunity` surfaces |
| Search results | `search.tsx` user rows |
| Clan member list | `clan.$slug.tsx` roster |
| Game-over popup ("Rematch" is a challenge) | `game.$id.tsx` |

**Button state machine (client-side gating, cosmetic only — the RPC re-checks
everything):**

- Hidden: target is self; target is blocked by me or has blocked me
  (`community_blocks` either direction); viewer not authenticated.
- Disabled + tooltip "Offline": target fails the 90s freshness rule.
- Disabled + tooltip "In a game": target's `current_game_id` is non-null.
- Disabled + "Challenge pending": a pending challenge already exists between
  the pair (known from the ChallengeProvider's state).
- Enabled otherwise → opens **ChallengeConfigModal**.

The button subscribes to nothing itself; it reads presence data the parent
list already has, plus the ChallengeProvider context. Zero extra sockets per
row.

---

## 5. Challenge Configuration Modal (requirement §2)

A single modal, opened from any ChallengeButton, pre-filled from the user's
last-used settings (persisted in `user_settings` under a `challenge.defaults`
key, falling back to 5+0 casual random).

Contents, top to bottom:

1. **Opponent header**: avatar, display name, @username, rating, online dot.
2. **Time control**: segmented grid — 1, 2, 3, 5, 10, 15, 30 minutes.
3. **Increment**: segmented row — 0, 1, 2, 3, 5, 10 seconds.
4. **Color**: three tiles — White / Random / Black (random default, centered,
   Chess.com-style).
5. **Rated toggle**: Rated / Casual. Disabled with tooltip when either player
   is provisional-banned from rated play (future flag; v1 always enabled).
6. **Variant**: dropdown, Standard only in v1; Chess960/Custom rendered but
   disabled with "Coming soon" (schema and RPC already carry `variant` so
   enabling later is UI-only).
7. **Primary CTA**: "Send Challenge" with derived label, e.g.
   "Send Challenge · 5+3 Rated". Disabled while the send RPC is in flight.

The time-class label (Bullet/Blitz/Rapid/Classical) is shown under the grid,
derived from minutes — the same derivation the server does, so what the user
sees is what gets stored.

---

## 6. Send Flow (requirement §3)

### 6.1 Client

1. User hits Send → button enters loading state.
2. Client calls RPC `send_challenge(p_opponent_id, p_initial_seconds,
   p_increment_seconds, p_is_rated, p_color, p_variant)`.
3. On success (returns challenge id + expires_at): modal closes, the
   **OutgoingChallengeToast** appears (Section 6.3), defaults persisted.
4. On error: modal stays open, the RPC's error code is mapped to a human
   message (table in Section 20.3). No retry loops — sending twice is safe
   (idempotent via the unique pending index) but pointless.

### 6.2 Server — `send_challenge` RPC (SECURITY DEFINER, one transaction)

Validation ladder, in order, each failing with a distinct error code:

1. `auth.uid()` present (`not_authenticated`).
2. `p_opponent_id <> auth.uid()` (`self_challenge`) — also schema-enforced.
3. Opponent exists in `profiles` and account not banned (`opponent_unavailable`).
4. Challenger not banned/muted from playing (`sender_restricted`).
5. No block in either direction in `community_blocks` (`blocked`). Return the
   *same* error code both directions — never reveal to a sender that they were
   blocked; the client renders it as "Player unavailable."
6. Opponent online per the 90-second rule (`opponent_offline`).
7. Challenger's `current_game_id IS NULL` (`sender_in_game`).
8. Opponent's `current_game_id IS NULL` (`opponent_in_game`).
9. No pending challenge involving *either* player with *anyone*
   (`challenge_exists`) — a player handles one challenge at a time, matching
   requirement §3. (The pair-level unique index is the last-resort race guard;
   this check gives the friendly error.)
10. `p_initial_seconds` and `p_increment_seconds` in the whitelists
    (`bad_time_control`); `p_variant = 'standard'` in v1 (`bad_variant`).

Then: INSERT the challenge row with `expires_at = now() + 60s`, derive
`time_control`/`time_class` server-side, INSERT a `notifications` row for the
opponent (`kind='challenge'`, link `/notifications`), and return
`{challenge_id, expires_at}`. The INSERT itself is what fans out realtime to
both parties — no separate publish step, no way for delivery and persistence
to disagree.

### 6.3 Outgoing toast (challenger's view)

Bottom-right persistent toast: "Challenging {name} · 5+3 Rated", live 60s
countdown ring (driven by `expires_at`, not a local timer), and a **Cancel**
button → `cancel_challenge(p_challenge_id)` RPC (validates caller is the
challenger and status is pending; sets `cancelled` + `responded_at`).
Cancelling instantly removes the opponent's popup via the same realtime UPDATE
event.

---

## 7. Global Delivery & the Incoming Popup (requirements §4–§5)

### 7.1 ChallengeProvider — the global listener

Mounted once in `__root.tsx` (inside the auth effect, sibling of
`startPresence`), alive on every page: Home, Play, Community, Profile,
Settings, Leaderboard, Clan, Puzzle, Tournament — all of them, because it
lives above the router outlet.

On login it:

1. **Reconciles**: SELECT any `pending` challenge where I'm opponent (→ show
   popup immediately, with remaining time computed from `expires_at`) or
   challenger (→ show outgoing toast). This is what makes the popup survive
   refresh, cold navigation, and missed events.
2. **Subscribes** to one channel `user-challenges:{uid}` with three
   postgres_changes bindings on `challenges`:
   - INSERT where `opponent_id=eq.{uid}` → incoming popup + notification sound
     + browser-tab title flash.
   - UPDATE where `opponent_id=eq.{uid}` → reconcile popup (cancelled/expired
     → dismiss with reason).
   - UPDATE where `challenger_id=eq.{uid}` → outgoing toast transitions
     (accepted → redirect; declined → "Challenge declined"; expired → "No
     answer").
3. **Re-reconciles on every channel re-SUBSCRIBE** (the pattern
   `game.$id.tsx` already uses): after any websocket drop, step 1 runs again,
   so no state is ever lost to a missed event.

RLS guarantees the feed only ever contains the user's own challenges.

### 7.2 Incoming challenge popup

A modal (not a toast — it demands a decision), rendered by the provider above
everything, showing exactly:

- Avatar, full display name, @username, rating (fetched in one profile SELECT
  when the event arrives; the popup renders skeleton-instantly and fills in).
- Time control + increment ("5 + 3 · Blitz"), Rated/Casual badge, the color
  *you* would get ("You play Black" / "Random").
- **Live 60-second countdown bar**, computed every 250ms as
  `expires_at - now()` — refresh-proof, clock-skew-tolerant (clamp to the
  server value received at reconcile).
- Buttons: **Accept** (primary), **Decline**, overflow menu with **Block
  user** (calls the existing block flow, which also declines) and **View
  profile** (opens `/u/$username` in the background; popup stays).

If a second challenge somehow arrives (race before the first expires), the
provider queues it and shows one popup at a time, oldest first.

---

## 8. Expiry (requirement §6)

Expiry is enforced in **three redundant layers** so it can never silently not
happen:

1. **Read-time**: every RPC that touches a challenge treats
   `status='pending' AND expires_at < now()` as expired regardless of the
   stored status (accept/decline on a stale row fails with
   `challenge_expired`).
2. **Client-time**: when either party's countdown hits zero, that client calls
   `expire_stale_challenges()` (a cheap RPC that flips all overdue rows it can
   see) and dismisses its own UI with "Challenge expired." Both clients do
   this, so whoever is still connected performs the flip and the UPDATE event
   notifies the other.
3. **Cron sweep**: `pg_cron` every minute runs the same expiry UPDATE across
   the whole table — the backstop when both parties closed their laptops. The
   UPDATE also inserts an `expired` notification for the challenger.

Layer 1 means correctness never depends on layers 2–3 firing on time; they
exist only so the UI updates and the table stays clean.

---

## 9. Decline Flow (requirement §8)

`respond_challenge(p_challenge_id, p_action := 'decline')`:

- Lock row `FOR UPDATE`; verify caller is `opponent_id`, status `pending`,
  not past `expires_at`.
- Set `status='declined'`, `responded_at=now()`.
- Insert a `notifications` row for the challenger ("{name} declined your
  challenge").

Challenger's toast flips to "Challenge declined" via the UPDATE event and
auto-dismisses after 4s. Nothing else happens; the opponent's popup closes
immediately (optimistically, confirmed by the event). Declines are silent to
third parties and don't rate-limit the challenger beyond Section 20.4.

---

## 10. Accept Flow (requirement §7) — the critical transaction

`respond_challenge(p_challenge_id, p_action := 'accept')`, SECURITY DEFINER,
**one transaction**:

1. `SELECT … FOR UPDATE` the challenge row. This lock is the whole concurrency
   story: cancel, decline, expire, and accept serialize on it.
2. Validate: caller is `opponent_id` (`not_your_challenge`); status `pending`
   (`already_resolved` — covers the accept-vs-cancel race deterministically:
   whoever commits first wins, the loser gets a clean error); `expires_at >=
   now()` (`challenge_expired`).
3. Re-validate liveness: both players still have `current_game_id IS NULL`
   (`player_busy`) and neither has blocked the other since send.
4. **Resolve colors**: challenger's preference honored; `random` resolved with
   `random() < 0.5` (the convention the existing `create_challenge` RPC
   already uses). Snapshot both players' usernames and per-time-class
   ratings via the existing `public.current_rating(uid, time_class)` helper.
5. INSERT the `games` row: status `'active'`, `challenge_id` set, colors,
   snapshot ratings/usernames, `is_rated`, clocks initialized to
   `initial_seconds * 1000` for both sides, `fen` = start position, `turn='w'`,
   `started_at = NULL` (clock armed but not running — Section 11),
   `last_move_at = NULL`.
6. UPDATE challenge: `status='accepted'`, `game_id`, `responded_at`.
7. UPDATE both profiles: `current_game_id = <new game id>`.
8. INSERT `notifications` for the challenger ("Challenge accepted — game
   starting").
9. Return `{game_id}`.

The partial unique index on `games.challenge_id` makes a double game creation
impossible even if a bug ever bypassed the row lock.

**Fan-out**: the accepter navigates using the RPC return value; the challenger
navigates from the challenge UPDATE event (`status='accepted'` + `game_id`).
Both paths are pure data — no bespoke "game started" message that could be
spoofed or lost.

---

## 11. Auto-Redirect & Game Initialization (requirements §9–§11)

### 11.1 Transition

Both clients run the same sequence with zero user action:

1. Freeze challenge UI → full-screen transition overlay: opponent avatar vs
   your avatar, "Game found" style animation, minimum display 600ms (so the
   transition never flickers even when loading is instant).
2. Router navigate to `/game/{game_id}` (SPA navigation — no reload).
3. `game.$id.tsx` performs its existing parallel fetch (game row, moves,
   chat, both profiles) **plus** user settings (board theme, piece theme,
   sounds — already global via `useGameSettings`/`useBoardSettings`). The
   profile select is extended to include `country` (column exists on
   `profiles`) so both player plates render avatar, display name, @username,
   rating snapshot, and country flag.
4. Overlay dissolves only when everything required by requirement §10 is in
   memory — both player identities (avatar, rating, country, username), game
   mode (rated/casual + time class), assigned colors, initialized timers,
   (empty) move list, chat pane, connection-status indicators (per-game
   presence channel joined), board theme, piece theme, and saved user
   settings. "Everything loads before the first move" — no board flash of
   wrong theme, no placeholder avatars.

### 11.2 Pre-start state ("waiting for White")

The game is `active` but `started_at IS NULL`:

- Both clocks render full and **paused** (no ticking, muted styling).
- Banner: "White to move — clocks start after the first move."
- The `makeMove` server function, on committing ply 1, sets
  `started_at = now()` and `last_move_at = now()`. From that commit onward,
  remaining time is always computed as
  `stored_time_ms - (now() - last_move_at)` for the side to move — the
  server's existing authoritative-clock model, now anchored to first move
  instead of game creation.
- **Never-started abort**: if White plays nothing for 60 seconds after accept,
  either player may invoke an `abort_game` RPC (new, mirrors
  `claim_timeout`'s pattern): validates `started_at IS NULL` and
  `created_at < now() - 60s`, sets result `aborted`, `end_reason='aborted'`,
  no rating change, clears both `current_game_id`. The client shows an
  "Abort" button in place of "Resign" during this window. (If White moved but
  Black never does, the normal clock/timeout path handles it.)

---

## 12. Move Flow (requirement §12)

Unchanged pipeline, restated precisely because it is the heart of the UX:

1. **Local gesture** (drag or tap-tap): legality pre-checked client-side with
   chess.js — illegal moves never leave the device (snap-back animation).
2. **Optimistic apply**: board animates the move, plays the correct sound
   (move/capture/check/castle/promote per SAN, existing logic), clock switches
   locally. Latency to the user: 0ms.
3. **Submit**: `submitMove` server function. Server re-validates from the
   authoritative FEN, enforces `by_user` = side to move, recomputes clocks
   from `last_move_at`, applies increment, detects mate/stalemate/draw rules,
   commits `game_moves` row + `games` update in one transaction.
4. **Broadcast**: both postgres_changes events (`games` UPDATE, `game_moves`
   INSERT) reach both clients. The mover reconciles silently (dedup by `ply`,
   already implemented); the opponent animates the move, plays the sound,
   switches the clock.
5. **Rejection** (rare: stale FEN, flag fell mid-flight): the optimistic move
   rolls back with a snap animation, board resyncs from the server row, toast
   explains ("Move rejected — out of time").

Clock display between moves is interpolated client-side at 100ms from
`last_move_at` + stored ms — smooth ticking with zero network traffic; the
server remains the only authority at commit time. Low-time (<10s) triggers
the tick sound and red pulse per existing sound settings.

---

## 13. Connection Handling (requirement §13)

### 13.1 Per-game presence channel

`game.$id.tsx` joins `game-presence:{game_id}` (Supabase Presence), tracking
`{user_id, role: player|spectator}`. Both players see the opponent's dot
flip instantly on join/leave — this drives the **UI**, not the forfeit.

### 13.2 What each side sees

- **You disconnect**: full-board overlay "Reconnecting…" with animated dots;
  input disabled; on websocket re-SUBSCRIBE the room refetches game + moves
  (already implemented) and play resumes seamlessly. Nothing is lost because
  nothing client-side was authoritative.
- **Opponent disconnects**: banner "{name} disconnected — reconnecting…" with
  a live countdown of their grace window. Their clock **keeps running** —
  exactly Chess.com semantics: disconnection never pauses the game.

### 13.3 Forfeit rule (server-authoritative, no new daemon)

Disconnection forfeit is deliberately reduced to the *clock*: the opponent's
time keeps draining while gone; if their flag falls, the existing
`claim_timeout` RPC ends the game (`end_reason='timeout'` — or
`'abandoned'` when the presence record shows them absent at claim time, which
the claim RPC checks via `*_disconnected_at`). Additionally, for long time
controls, a grace cap: when a player has been continuously absent for
`min(120s, remaining_time)` — tracked by the client writing
`white/black_disconnected_at` via a `report_disconnect` RPC on presence-leave,
cleared on rejoin — the present player gets an enabled **"Claim victory"**
button calling `claim_abandonment` (validates the timestamp gap server-side).
Both paths converge on the standard game-end transaction (Section 14).
Reconnect within the window clears the timestamp and the banner: "Opponent
reconnected", game continues, nothing lost.

### 13.4 `game_events` audit table

Append-only rows `(game_id, user_id, kind, at)` with kinds
`disconnect · reconnect · draw_offer · draw_decline · abort · rematch_offer`,
written by the RPCs above — satisfies "reconnect events permanently stored"
and feeds the future replay/anti-abuse tooling.

---

## 14. Game End & Result (requirements §14–§15)

**End conditions and where they're detected** (all commit through the same
end-of-game transaction: set result/winner/end_reason/ended_at, apply ratings
via the existing elo/iq path, clear both `current_game_id`, insert two
notifications):

| Condition | Detector |
|---|---|
| Checkmate, stalemate, threefold, fifty-move, insufficient material | `makeMove` server fn at commit (chess.js) |
| Timeout | `claim_timeout` RPC (opponent claims; either client's local flag-fall triggers the claim) |
| Resignation | `resign_game` RPC |
| Draw by agreement | `respond_draw` RPC (offer → accept) |
| Abort (pre-first-move) | `abort_game` RPC |
| Abandonment | `claim_abandonment` / `claim_timeout` (Section 13.3) |

**Result popup** (both clients, triggered by the `games` UPDATE where result ≠
`ongoing`): trophy/handshake animation; winner & loser with avatars; result
line ("Checkmate · 0–1"); **rating change** (±N, old → new, from
`rating_history`; hidden for casual); game duration (`ended_at − started_at`);
moves played; accuracy slot rendered but "—" until the analysis pipeline
(existing `game_analysis`) backfills it. Buttons: **Rematch**, **Analysis**
(existing `/game/$id/review`), **Download PGN** (client-side file from
`games.pgn`), **Return Home**. Popup is dismissible; the finished board stays
browsable underneath (existing behavior).

---

## 15. Rematch (requirement §16)

A rematch **is a challenge** — same table, same RPCs, same popup, same expiry:

- "Rematch" calls `send_challenge` with the same settings, opponent, and
  `rematch_of_game_id = finished game id`; **colors swapped** (loser-of-color
  convention: each player gets the color they didn't have).
- The online/in-game validations naturally apply; since both players are on
  the result screen, the incoming side sees an inline **Rematch offer strip
  in the result popup itself** (the ChallengeProvider detects
  `rematch_of_game_id === current game` and renders inline instead of the
  global modal): "{name} wants a rematch — Accept / Decline", 60s countdown.
- Accept runs the standard accept transaction → both clients auto-navigate to
  the new `/game/$id`. Instant, no refresh.
- If both players hit Rematch simultaneously, the pair-level unique pending
  index makes the second `send_challenge` fail with `challenge_exists`; the
  client interprets that specific code in rematch context as "offer already
  open — accept it instead" and auto-accepts. Simultaneous rematch clicks
  therefore just start the game — the Chess.com behavior.

---

## 16. In-Game Chat (requirement §17)

Builds on existing `game_chat` (realtime INSERT feed already wired):

- **Messages**: existing insert path (RLS: self-insert only), 500-char check.
  Server-side blocked-words filter moves into a `send_game_chat` RPC so
  filtering can't be bypassed (INSERT grant to `authenticated` is then
  revoked; the RPC also rejects messages from players who have muted each
  other or when the game has been over for >5 minutes).
- **Emoji**: client-side picker inserting unicode — no schema change.
- **Typing indicator**: broadcast event `typing` on the `game-presence`
  channel, throttled to 1/2s, auto-clearing after 3s. Ephemeral, never stored.
- **Read status**: presence-derived — if the opponent is in the room, messages
  render "seen"; no per-message receipts in v1 (future: `read_up_to_ply`
  broadcast).
- **Mute**: existing `community_mutes` honored in the RPC (drops delivery) and
  client (hides rendering); per-game "mute chat" toggle is client-local.

---

## 17. Spectators (requirement §18 — future-ready, zero rework)

Already structurally supported and deliberately preserved:

- `games`/`game_moves`/`game_chat` are SELECT-public; anyone can open
  `/game/$id` and receive the same realtime feed — that *is* spectating.
- The presence channel's `role: spectator` distinguishes watchers; a
  spectator-count badge is a fold of presence state.
- Broadcast/observer modes and spectator chat are additive UI on the same
  channels. The only rule that must hold forever: **no game-mutating path
  ever trusts channel membership — only `auth.uid()` against
  `white_id/black_id`** — which is already how every RPC works. Private/
  unlisted games later = an RLS predicate change, not an architecture change.

---

## 18. Notifications (requirement §22)

Two complementary planes, both already scaffolded:

1. **Persistent** — `notifications` rows written inside the RPC transactions:
   challenge received, accepted, declined, expired (challenger side), game
   started, game finished (+result), rematch offered. Visible in
   `/notifications` and the existing badge counter, which gains a
   postgres_changes subscription on own-user INSERTs so the bell updates live.
2. **Ephemeral** — the ChallengeProvider's popups/toasts and in-game banners
   (opponent disconnected/reconnected) driven purely by realtime events;
   never stored, never needed after the moment passes.

Rule: anything a user must be able to discover later is plane 1; anything
that only matters right now is plane 2; several events are both.

---

## 19. Security Model (requirement §20)

| Threat | Defense |
|---|---|
| Duplicate games | Partial unique index on `games.challenge_id`; accept runs under `FOR UPDATE` on the challenge row |
| Duplicate challenges | Partial unique pending-pair index + one-pending-per-player RPC check |
| Fake acceptance | Only `opponent_id` (from `auth.uid()`, never a parameter) can accept; SECURITY DEFINER RPC is the only write path |
| Unauthorized moves / move injection | Client cannot write `games`/`game_moves` at all; `makeMove` verifies `auth.uid()` is the side to move and re-validates legality server-side from the stored FEN |
| Room spoofing | Channels carry zero authority; all mutations re-derive identity from the JWT; RLS scopes what each socket can even see |
| Replay attacks | Moves are keyed by `(game_id, ply)` UNIQUE against server state — a replayed submission is a no-op conflict; challenge accept is single-shot by status transition |
| Expired acceptance | `expires_at` checked inside the locked transaction (layer 1 of Section 8) |
| Self-challenge | CHECK constraint + RPC validation |
| Offline-target challenge | Server-side `last_seen` freshness check in `send_challenge` |
| Race conditions (accept vs cancel vs expire vs second accept) | Every transition serializes on the challenge row lock; losers get deterministic error codes |
| Clock manipulation | Client never reports its own time; server derives remaining time from `last_move_at` at each commit |
| Challenge spam | Rate limit via the existing `rate-limit` infrastructure: max 10 `send_challenge` per minute per user, max 3 per target per 10 minutes; blocks always win silently |
| Data leakage | `challenges` RLS restricts rows (and therefore realtime events) to the two participants |

---

## 20. Error Handling (requirement — complete error flow)

### 20.1 Principles

Every RPC failure returns a **stable machine code** (the strings in Sections
6.2/10); the client owns the human phrasing. Unknown codes render a generic
"Something went wrong — nothing was changed" (safe because every RPC is
transactional: partial state cannot exist).

### 20.2 Realtime failure

The websocket is an optimization, never a dependency: every surface
(ChallengeProvider, game room, toasts) refetches its truth on `SUBSCRIBED`,
and the challenge popup additionally polls its own row every 10s while open
(cheap single-row select) so even a fully dead socket degrades to ≤10s
latency rather than wrongness.

### 20.3 User-facing message map (excerpt)

| Code | Surface message |
|---|---|
| `opponent_offline` | "{name} just went offline." |
| `opponent_in_game` | "{name} is in a game right now." |
| `challenge_exists` | "There's already a pending challenge." (auto-accept in rematch context) |
| `challenge_expired` | "This challenge has expired." |
| `already_resolved` | "This challenge was already answered." |
| `blocked` / `opponent_unavailable` | "Player unavailable." (identical on purpose) |
| `player_busy` (at accept) | "{name} just started another game." |

### 20.4 Edge inventory (each has a defined outcome)

- Accept lands 1ms after cancel → `already_resolved`, popup closes with
  "Challenge withdrawn."
- Both hit Rematch at once → auto-accept path (Section 15).
- Opponent accepts while challenger's tab is asleep → challenger's reconcile
  on wake finds `accepted` + own `current_game_id` → redirect into the live
  game, clocks already authoritative.
- User logs in on a second device mid-challenge → both devices reconcile the
  same rows; whichever answers first wins the row lock; the other reconciles.
- Challenge accepted but accepter crashes before navigating → the game exists
  and their clock will run; on next login, reconcile sees
  `current_game_id` non-null → banner "You have a game in progress — Return
  to board" (this banner is global, in the ChallengeProvider).

---

## 21. UX & Polish Requirements (requirement §21)

- **Latency budget**: optimistic move render 0ms; challenge popup appears
  within one realtime hop (~100–300ms); accept-to-board under 1.5s including
  the deliberate 600ms transition.
- **No flicker**: the transition overlay covers navigation + data load; the
  board never renders before theme/settings/profiles are resolved; skeletons
  only inside the popup (never a blank popup).
- **Sound**: challenge-received uses a distinct notification cue from the
  existing sound-theme engine; all move sounds follow the user's theme;
  everything respects the master sound toggle.
- **Countdowns** are anchored to server timestamps, so two devices always
  show the same number.
- **Reduced motion**: all transitions honor `prefers-reduced-motion`
  (instant swaps instead of animations).
- **Mobile**: the incoming popup renders as a bottom sheet under 640px; the
  config modal's grids collapse to 4-per-row; drag & tap-tap both supported
  (existing board behavior).

---

## 22. Implementation Phasing (suggested, dependency-ordered)

1. **Schema**: `challenges` table + indexes + RLS + realtime publication;
   `games.challenge_id/started_at/disconnected_at`; `profiles.current_game_id`;
   `game_events`. (One migration, additive only.)
2. **RPCs**: `send_challenge`, `respond_challenge`, `cancel_challenge`,
   `expire_stale_challenges` + cron, `abort_game`, `report_disconnect`,
   `claim_abandonment`; extend `makeMove` for `started_at`; extend game-end
   paths to clear `current_game_id`.
3. **ChallengeProvider** + incoming popup + outgoing toast + reconcile logic.
4. **ChallengeButton + ConfigModal**, wired into the 7 surfaces.
5. **Game-room extensions**: pre-start state, abort button, presence channel,
   disconnect banners, transition overlay.
6. **Result popup + rematch inline flow.**
7. **Chat hardening** (`send_game_chat` RPC, typing indicator).
8. **Presence tightening** (30s heartbeat, `presence:lobby`).

Each phase ships independently; phases 1–3 alone deliver a working
end-to-end challenge → game loop.

---

## 23. Future-Readiness Map (requirement §23)

| Future feature | Why it needs no rewrite |
|---|---|
| Chess960 / custom variants | `variant` column + RPC param exist; enable = UI + start-FEN generation in accept transaction |
| Tournament / clan / arena challenges | `challenges` gains a nullable `context_type/context_id`; validation ladder gets one context rule; everything downstream identical |
| Team battle / coach invite | Same context mechanism |
| Private match password / invite links | Existing link-based `create_challenge` flow remains; password = column + check in `join_game` |
| Voice/video chat | New ephemeral channel per game; zero schema impact (signaling over broadcast) |
| Spectator chat / broadcast mode | Section 17; additive UI on public reads + presence roles |
| Share game / replay | `games.pgn` + `game_moves.fen_after` already form a full replay record; `game_events` adds the timeline |
| Accuracy in result popup | Backfilled from existing `game_analysis` pipeline; slot already rendered |

---

*End of specification.*
