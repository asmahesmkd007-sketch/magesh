# ChessOX Gameplay Audit

Scope: the full gameplay path — board, move handling, rules, results, clocks,
realtime sync, replay, move history — across live multiplayer
(`/game/$id`), local pass-and-play (`/play/local`), bot play (`VsComputer`),
spectator (`/watch/$id`), tournament arena, review (`/game/$id/review`) and
puzzles.

Verified state after this pass: `tsc --noEmit` clean, `vitest run` 358/358
passing, `vite build` succeeds, and every gameplay source file is
lint-clean.

---

## 1. Root cause: "only Black Win appears"

**Confirmed and fixed.** This was not one bug in one place; it was one
*defect shape* repeated across the result-rendering surfaces.

`games.result` is the Postgres enum `game_result`, which has **five**
members and defaults to `'ongoing'`:

```sql
CREATE TYPE public.game_result AS ENUM ('white','black','draw','ongoing','aborted');
-- games.result  NOT NULL  DEFAULT 'ongoing'::game_result
```

(Verified directly against the deployed project `pzrizyvloqjqypirlqda`.)

Two surfaces reduced that five-member enum to a boolean:

| Location | Code |
| --- | --- |
| `src/components/site/GameEndModal.tsx:33` | `` `${result === "white" ? "White" : "Black"} Wins` `` |
| `src/routes/game.$id.tsx:845` | `` `${game.result === "white" ? "White" : "Black"} Wins` `` |

Anything that is not exactly the string `"white"` fell into the else-branch
and rendered **"Black Wins"** — including `draw`, `ongoing` and `aborted`.

Three aggravating factors made it show up more often than it otherwise would:

1. `GameEndModal` additionally collapsed *any* resignation into the title
   "Resignation", discarding the winner entirely.
2. The board's end-overlay (`endState` in `game.$id.tsx`) defaulted every
   non-decisive value to `"draw"`, so the overlay and the modal could
   disagree about the same game.
3. The optimistic-checkmate branch derived the winner from `game.turn`,
   which flips one render *before* the optimistic state is cleared — naming
   the wrong winner for a frame.

### Fix

New module `src/lib/chess/result.ts` is now the single interpretation of
`games.result`. `normalizeResult()` is total over `string` and sends
anything unrecognised to `"ongoing"` — never to a winner. All result
rendering goes through `resultHeadline` / `personalHeadline` /
`resultSentence` / `formatEndReason`.

`src/lib/chess/result.test.ts` locks it down, including the direct
regression:

```ts
it("names Black as winner for exactly one result", () => {
  expect(ALL.filter((r) => resultHeadline(r) === "Black Wins")).toEqual(["black"]);
});
```

Note: `watch.$id.tsx`, `game.$id.review.tsx`, `play.history.tsx`,
`profile.tsx` and `ArenaBoard.tsx` already handled all five values
correctly — the defect was localised to the two call sites above.

---

## 2. Server move handler destroyed every game's PGN

`src/lib/api/game.functions.ts` validated each move by building
`new Chess(storedFen)` and then wrote `chess.pgn()` back to `games.pgn`.

A `Chess` seeded from a FEN has **no move history**, so `.pgn()` emits only
the single move just played, under `SetUp`/`FEN` headers. Demonstrated
directly:

```
OLD: "[SetUp \"1\"][FEN \"…\"]  5. O-O *"      ← whole game lost, every move
NEW: "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O *"
```

The same history-less instance made `isThreefoldRepetition()` permanently
`false`, so **repetition draws could never be detected in any multiplayer
game**.

### Fix

The handler now replays `game_moves.san` (already the authoritative record,
written in the same transaction as the FEN) to rebuild a full-history
instance, and asserts the replayed FEN equals the stored FEN before
trusting it. On mismatch it falls back to the FEN-only instance for
validation and **leaves `games.pgn` untouched** rather than overwriting a
real game with a fragment.

---

## 3. Draw rules were mislabelled and partly unreachable

`chess.isDraw()` is a catch-all — true for stalemate, insufficient
material, threefold *and* the fifty-move rule. Three places ended their
chain on it and labelled the outcome `"fifty-move"`:

- `game.functions.ts` — mislabelled every draw that reached it.
- `play.local.tsx` — worse: it tested `isDraw()` **before** `isStalemate()`,
  making the stalemate branch dead code. Every stalemate reported a bare
  "Draw".
- `VsComputer.tsx` — same terminal chain, duplicated a third time.

Also absent everywhere: fivefold repetition, the seventy-five-move rule,
and FIDE 6.9 (a flag fall against a player who cannot possibly mate is a
draw, not a loss).

### Fix

New module `src/lib/chess/rules.ts` — one FIDE terminal-state authority used
by the server, the live board, local play and the bot:

- Mate is evaluated **before** every draw rule (a mating move that also
  completes the fifty-move count is mate, not a draw).
- Stalemate / insufficient material / fivefold / seventy-five-move are
  `automatic: true`; threefold and fifty-move are `automatic: false`
  (claimable under FIDE, auto-settled here as on other platforms) — the
  distinction is recorded so a claim-based UI can be added without
  re-deriving it.
- `priorPositionKeys` lets a FEN-only instance count repetitions from
  positions supplied by the caller, which is what makes repetition work on
  the server and in the client's optimistic path.
- `hasMatingMaterial()` implements FIDE 6.9. Applied in local play, bot
  play, and the server's flag-fall branch.

30 tests in `src/lib/chess/rules.test.ts`.

---

## 4. Clocks could not keep time

Both `play.local.tsx` and `VsComputer.tsx` ran `setInterval(… , 1000)` with
`t => t - 1`. That design cannot hold time:

- `setInterval` guarantees "at least" 1000 ms, never exactly — error
  accumulates over a game.
- Background tabs are throttled, so a backgrounded game silently **gained**
  time.
- `play.local.tsx` called `endGame()` from **inside a state updater**, which
  React may invoke twice.
- `VsComputer.tsx` used `if (t <= 1) return 0`, skipping from 2 straight to
  0; it had **no increment at all** and a hardcoded 900 s clock.
- `play.local.tsx` capped the increment at the starting time
  (`Math.min(t + inc, sec)`), so a 1+2 game could never bank above 60 s.
- Nothing survived a refresh, because remaining time existed only as a
  counter, never as a deadline.

### Fix

New `src/lib/chess/clock.ts` — a pure, wall-clock-anchored clock holding
*banked* time plus the timestamp the running turn began. Remaining time is
always recomputed from `Date.now()`, so it cannot drift, cannot be lost to
throttling, and restores across a refresh for free. Supports Fischer
increment and US simple delay. 26 tests, including:

```ts
it("is unaffected by a backgrounded tab (no ticks at all)", …)
it("does not drift across many reads at irregular intervals", …)
it("does not cap the increment at the starting time", …)
it("accounts for wall-clock elapsed while the page was gone", …)
```

`src/hooks/useChessClock.ts` renders it: repaints are scheduled to land just
after the next visible digit change, so an idle board repaints ~1×/s instead
of 10×/s, and the flag callback fires from an effect exactly once per turn.

A defect the tests caught during development: `isUntimed` originally checked
`running === null`, so a "no timer" game flagged the instant a turn started.
Untimed is now fixed at clock creation.

Bot play additionally gained a bullet→classical time-control picker
(1+0 … 30+20), replacing the hardcoded 15-minute clock.

---

## 5. Schema: duplicate `claim_timeout` that dropped rating updates

`supabase/schema.sql` defined `public.claim_timeout` **twice** (SECTION 30
and again ~line 19000). The later definition wins on any full re-run of the
file, and it silently omitted `PERFORM public.apply_elo_change(...)` — so
ratings would stop updating whenever a game ended on the clock. It also
wrote `end_reason` as `'white_won_on_time'`/`'black_won_on_time'` instead of
SECTION 30's `'timeout'`.

The **deployed** database runs the SECTION 30 version (verified via
`pg_get_functiondef`), so production is currently correct — the file was a
latent regression waiting for the next full apply. The duplicate has been
removed so the file matches production.

---

## 6. The live board's clock ran at double speed

Found on a second pass over `game.$id.tsx`, and the most user-visible
timer defect in the app.

The route computed the elapsed time and subtracted it:

```ts
const elapsedSinceLastMove = now - realLastMoveAt;
const whiteMs = game.white_time_ms - (game.turn === "w" ? elapsedSinceLastMove : 0);
```

then passed that result to `PlayerCard` as `baseMs`, together with
`lastMoveAt` — and `PlayerCard` subtracted the elapsed time **again**:

```ts
const elapsed = active && lastMoveAt ? now - lastMoveAt : 0;
const currentMs = Math.max(0, baseMs - elapsed);
```

Net effect: `white_time_ms − 2 × (now − last_move_at)`. The side to move
watched their clock drain at twice real speed and read 0:00 at the halfway
point, while the flag watcher — which used the singly-subtracted value —
still considered the clock live. That combination reads exactly like
"timer jumps / freezes / desyncs".

### Fix

`clockFromServer()` in `clock.ts` is now the only way a `games` row becomes
a clock, and it documents the invariant: the stored times are *banked as of
`last_move_at`*, so the elapsed time is applied exactly once, inside
`remainingMs`. The route builds one `ClockState`; each `PlayerCard` renders
one side of it via `useChessClock`.

Two further wins fell out of this:

- The route's 500 ms `setInterval` (which re-rendered the whole page,
  board included) is gone, as are the per-card 100 ms intervals. Ticking
  now lives only inside `PlayerCard`.
- The flag watcher no longer polls. It schedules a single `setTimeout` for
  the exact instant the opponent's clock reaches zero, so it stays correct
  even if the tab is throttled in between.

The regression is pinned by `clock.test.ts`:

```ts
expect(remainingMs(c, "w", T0 + 30_000)).toBe(5 * MIN - 30_000);
expect(remainingMs(c, "w", T0 + 30_000)).not.toBe(5 * MIN - 60_000);
```

---

## 7. Board rendering and animation

Three defects in `InteractiveBoard.tsx`, all fixed.

**Every pointermove re-rendered the entire board.** `onGridPointerMove`
called `setDrag({...})`, so 60–120 React renders per second of dragging —
all 64 squares and 32 pieces — purely to move one floating glyph. Now only
the *origin square* is state (it changes twice per drag); the pointer
position goes to a ref and is written straight to the floating element's
`transform`, batched to one write per animation frame and kept on the
compositor.

**`React.memo` on the squares was doing nothing.** `MemoizedSquare`
received `onSquare`, whose identity changes on nearly every render of the
parent (in the live game its `useCallback` depends on the chess position
and the move list). One changed prop invalidated all 64 memoised squares
every render. Squares now receive a permanently-stable wrapper and the live
handler is reached through a ref.

**Piece identity was assigned impurely.** `useStablePieces` mutated its
previous-state ref *inside a `useMemo`*. Under StrictMode — or any
concurrent re-render — the component body runs twice, so the second pass
read back the map the first pass had just written, concluded every piece
had moved, and issued fresh ids. Fresh ids remount the DOM nodes, which
means pieces **teleport instead of gliding** and the entrance "pop"
re-fires on pieces that merely moved.

The mapping is now a pure function in `src/lib/chess/pieceIdentity.ts`,
cached by board signature, with 12 tests covering identity across quiet
moves, captures, castling, promotion (the node is deliberately kept so a
promoting pawn glides rather than pops) and en passant — plus explicit
purity and idempotence tests.

---

## 8. Puzzle mode

- The wrong-move branch hardcoded `promotion: "q"`, which silently turned
  an attempted underpromotion into a queen — a player exploring `=N` could
  never see their own idea on the board. It now only supplies a promotion
  piece when the position actually calls for one.
- `puzzle.moves[step]` was dereferenced without a bounds check;
  `.slice()` on `undefined` threw and left the board wedged mid-puzzle when
  a stored `step_index` ran ahead of the solution array.

---

## Findings NOT fixed in this pass

### Database — one migration written but NOT applied

`supabase/patches/2026-07-29_fide_6_9_timeout.sql` brings the
`claim_timeout` RPC in line with FIDE 6.9 (a flag fall against a player who
cannot mate is a draw, not a loss). The TypeScript `makeMove` path already
implements this, so **the two currently disagree**: a game that flags
inside `makeMove` is correctly drawn when the winner has only a bare king,
while the same position claimed through `claim_timeout` is recorded as a
win.

The patch is `CREATE OR REPLACE` only and changes no data, but it alters
production behaviour, so it has deliberately been left unapplied. Both
branches are already merged into `schema.sql`, so a fresh apply of that
file is correct.

The tournament and global clock sweeps have the same gap and are not
covered by this patch.

### Live game route
- The live board still has no replay / prev-next controls, and its move
  list has no click-to-jump or current-move highlight. Both exist on the
  review route only.

### Server
- `makeMove` now issues one extra `SELECT` (prior moves) per move. Correct
  and cheap, but worth watching under load.

### Lint
55 errors / 15 warnings remain, **all outside gameplay** — mostly
`@typescript-eslint/no-explicit-any` in `profile.tsx`, `useWithdrawal.ts`,
`leaderboards.tsx`, `settings.tsx` and admin/clan/wallet routes, plus
`react-hooks/exhaustive-deps` warnings. Down from 139 at the start.
`public/engine` (vendored Stockfish) is now ignored, since linting a
third-party generated build is meaningless.

### Unrelated fix made in passing
`src/lib/auth/password.test.ts` asserted a 3–20 character username rule that
the implementation had replaced with "exactly 11 characters containing `_` or
`.`". Two tests were failing before this pass; the tests were stale, not the
code, and have been updated to the implemented spec.

### Lint
55 errors / 15 warnings remain, **all outside gameplay** — mostly
`@typescript-eslint/no-explicit-any` in `profile.tsx`, `useWithdrawal.ts`,
`leaderboards.tsx`, `settings.tsx` and admin/clan/wallet routes, plus
`react-hooks/exhaustive-deps` warnings. Down from 139 at the start of this
pass. `public/engine` (vendored Stockfish) is now ignored, since linting a
third-party generated build is meaningless.

### Unrelated fix made in passing
`src/lib/auth/password.test.ts` asserted a 3–20 character username rule that
the implementation had replaced with "exactly 11 characters containing `_` or
`.`". Two tests were failing before this pass; the tests were stale, not the
code, and have been updated to the implemented spec.

---

## What I could not verify

No browser or device was available in this environment, so the following
claims from the original brief are **not** verified and should be treated as
open:

- 60 FPS / CPU / memory targets. The render-count causes above were fixed
  by inspection and are sound in principle, but no frame timings were
  measured.
- Animation behaviour on screen (teleporting, flickering, double
  animation). The identity rules behind it are unit-tested; the visual
  result is not.
- Real two-client multiplayer sync, packet ordering, reconnect and offline
  recovery under real network conditions.
- Mobile and desktop layout across breakpoints, and touch dragging.
- "No console errors" at runtime.

`supabase/patches/2026-07-29_fide_6_9_timeout.sql` has not been executed,
so its SQL is unverified against a live server — the logic mirrors the
unit-tested TypeScript, but the plpgsql itself has never been parsed by
Postgres.

The `games` table in the deployed project is currently **empty**, so no
historical result data existed to confirm the win/loss symptom from
production rows; the root cause above was established from the schema, the
deployed function definitions, and the client code.
