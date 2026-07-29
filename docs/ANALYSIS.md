# Analysis Module — the ChessOX Engine Room

The analysis module (`/analysis`) is a full game-study environment: a real
Stockfish engine in the browser, an annotated move tree with nested variations,
automated game review with move classification, charts, position insights, an
opening explorer backed by ChessOX's own games, Syzygy endgame tablebases, and
a cloud analysis library.

This document explains the architecture, the data flow, and the operational
requirements.

---

## Architecture at a glance

```
routes/analysis.tsx
└─ components/analysis/AnalysisWorkspace.tsx        ← composition + shortcuts
   ├─ useAnalysisSession()                          ← game tree + cursor + review state
   │  ├─ lib/chess/moveTree.ts    GameTree (variations, comments, NAGs)
   │  ├─ lib/chess/pgn.ts         tolerant PGN reader / spec-shaped writer
   │  ├─ lib/analysis/gameAnalyzer.ts   batch Stockfish review
   │  └─ lib/analysis/review.ts   accuracy, phases, critical moments
   ├─ useEngine()                                   ← live analysis binding
   │  └─ lib/engine/stockfishEngine.ts  worker controller (singleton)
   │     └─ lib/engine/uci.ts     pure UCI protocol parsing
   ├─ EnginePanel / EvalBar / board arrows          ← live engine surfaces
   ├─ MoveTreePanel                                 ← annotated move list
   ├─ ReviewPanel / AnalysisCharts                  ← review output
   ├─ InsightsPanel   ← lib/analysis/positionInsights.ts
   ├─ OpeningExplorerPanel  ← lib/api/openingExplorerClient.ts (RPC)
   ├─ TablebasePanel        ← lib/api/tablebaseClient.ts (Lichess Syzygy)
   └─ SavedAnalysesDialog   ← lib/api/savedAnalysisClient.ts (RLS table)
```

Layering rules:

- `lib/engine/*` and `lib/chess/*` and `lib/analysis/*` are **pure TypeScript**
  (no React, no DOM beyond the Worker API) and carry the unit tests.
- `lib/api/*` is the service layer — the only place Supabase/network calls live.
- `components/analysis/*` is presentation plus one state hook.

## The engine

- **Binary**: Stockfish 18 lite (NNUE, ~7 MB WASM), installed from the
  `stockfish` npm package. `scripts/copy-engine.mjs` copies the builds into
  `public/engine/` before `dev` and `build` (the directory is gitignored;
  `node_modules` is the source of truth).
- **Build selection**: `stockfish-18-lite-single` runs everywhere. When the
  page is `crossOriginIsolated` (COOP+COEP headers), the multi-threaded
  `stockfish-18-lite` build is used instead and the Threads option unlocks.
  The app currently ships COOP only, so the single-threaded build is the
  default; enabling COEP is an ops decision (it constrains third-party embeds).
- **Controller** (`stockfishEngine.ts`): one engine instance per tab, spawned
  lazily. UCI has no request ids, so the controller strictly serialises
  searches — a new request `stop`s the current one and starts when its
  `bestmove` acknowledgment arrives. Options (MultiPV 1–5, Hash 16–512 MB,
  Threads) apply before the next `go`.
- **CSP**: `script-src` includes `'wasm-unsafe-eval'`; `worker-src 'self'
  blob:`; `connect-src` allows `tablebase.lichess.ovh`
  (see `src/lib/security-headers.ts`).

## Game review pipeline

1. `useAnalysisSession.runReview(depth)` snapshots the mainline.
2. `gameAnalyzer.analyzeGame` evaluates every position once at fixed depth
   with MultiPV 2 (rank 2 feeds only-move detection). Evaluations are cached
   in an LRU keyed by FEN+depth, so re-reviews and edits are cheap. Terminal
   positions short-circuit locally.
3. `classify.ts` turns evals into the classification vocabulary
   (brilliant, great, best, excellent, good, book, forced, interesting,
   dubious, inaccuracy, mistake, blunder, miss, missedWin, missedDraw,
   missedTactic, missedMate). Grading works on **win-probability deltas**
   (lichess-style 10/20/30 thresholds), so a +8 → +5 slip in a won position
   is not punished like an equal-position blunder. Sacrifice detection is a
   one-ply static-exchange heuristic on the destination square.
4. `accuracy.ts` converts win-probability swings into per-move accuracy and
   per-side game accuracy (mean + harmonic mean, so one disaster costs more
   than many tiny slips).
5. `review.ts` assembles the report: accuracy/ACPL per side, classification
   tallies, opening/middlegame/endgame phase summaries, critical moments
   (turning points, blunders, missed chances, brilliancies), and the
   eval / win-probability / material series the charts render.

Review depth presets: Quick (d10), Standard (d14), Deep (d18). On the
single-threaded WASM build, Standard reviews a 40-move game in roughly a
minute; the run is abortable and progress streams into the UI.

The post-game review page (`routes/game.$id.review.tsx`) runs the same
pipeline at depth 12 and persists through the `save_game_analysis` RPC —
the old depth-4 JavaScript engine (`analysis.worker.ts`) has been removed.
While a batch review runs it owns the engine; the workspace suspends live
analysis until it finishes.

## PGN & the move tree

`GameTree` is a mutable tree: `children[0]` continues a line, later children
are side variations. Nodes carry SAN, UCI, FEN, comments, NAG lists, and
`[%clk]` readings. React re-renders via a version counter — navigation does
not allocate.

The PGN reader (`parsePgn`) preserves comments, nested RAVs, NAGs and suffix
annotations, extracts clock tags, and **recovers** from the malformed PGN
found in the wild (glued move numbers, `0-0` castling, stray suffixes,
unterminated comments, multi-game files → first game + warning). Anything
unreadable becomes a warning and the legal prefix survives; only inputs with
no playable content throw.

The writer (`serializePgn`) emits the Seven Tag Roster, `SetUp`/`FEN` for
custom starts, variations in parens, comments in braces, quality NAGs as
suffix glyphs and other NAGs as `$n`, wrapped at 80 columns. "Annotated"
export is the default; a clean export strips comments/variations.

## Database

Schema section: **SECTION 101: ANALYSIS MODULE** in `supabase/schema.sql`
(idempotent, safe to re-run):

- `game_moves.classification` CHECK widened to the full vocabulary — the old
  6-value constraint silently rejected `brilliant`/`great`/`book`/`miss` rows
  that `save_game_analysis` already produced.
- `saved_analyses` — user-owned workspaces (annotated PGN + review summary),
  owner-only RLS on all four verbs, `updated_at` trigger, `(user_id,
  updated_at DESC)` index.
- `opening_explorer(p_epd, p_user, p_color, p_time_class, p_min_rating,
  p_since)` RPC + an expression index on the first four FEN fields of
  `game_moves.fen_before`, so continuation stats hit an index and match
  transpositions regardless of clocks.

## External services

- **Syzygy tablebases**: `tablebase.lichess.ovh` (≤ 7 pieces). Session-cached
  per position, 6-second timeout, degrades to a notice offline.
- Everything else — engine, PGN, insights, review — runs locally in the
  browser. No position data leaves the client except tablebase probes and the
  user's own explicit saves.

## Testing

Unit tests live beside their modules (`vitest`, node environment):

- `lib/engine/uci.test.ts` — protocol parsing, score folding/perspective
- `lib/chess/moveTree.test.ts` — tree ops, variations, NAG exclusivity
- `lib/chess/pgn.test.ts` — parse/serialize round-trips, recovery, FEN validation
- `lib/analysis/accuracy.test.ts` / `classify.test.ts` / `review.test.ts` /
  `positionInsights.test.ts` — the whole math layer

`npm test`, `npm run typecheck`, `npm run lint` are all clean; the review
pipeline itself is engine-in-the-loop and covered by the pure-logic tests
plus the existing `lib/chess/engine.test.ts` sanity checks.

## Operational notes

- **Docker/CI**: no changes needed — `npm run build` triggers the engine copy
  via the `prebuild` script and Vite ships `public/engine/` with the client
  assets. Verify `/engine/stockfish-18-lite-single.wasm` returns 200 after a
  deploy.
- **Caching**: serve `/engine/*` with long-lived immutable cache headers if
  you front the app with a CDN; the filenames are version-stamped by
  Stockfish major version.
- **Multi-threading (optional)**: add `Cross-Origin-Embedder-Policy:
  require-corp` (or `credentialless`) next to the existing COOP header to
  unlock the threaded build. Test third-party embeds (YouTube course videos)
  before enabling in production.
- **DB migration**: run `supabase/schema.sql` (idempotent) or extract
  SECTION 101 as a standalone migration.
