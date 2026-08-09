# Puzzle generation pipeline

Every puzzle shipped in `src/lib/chess/puzzles.ts` is **engine-verified with chess.js**:
a legal position (valid FEN, side-not-to-move not already in check), a forced move
line, and a final move that is a real checkmate. No random illegal positions, no
duplicates (deduped by FEN).

## Steps

1. **`generate.js <out.json>`** — samples random legal minimal-material positions
   (king + 1–2 pieces vs king, black king edge-biased) and keeps only those with a
   verified _forced_ mate in 1/2/3 via a forcing-line (check-driven) search. Writes
   incrementally so partial runs persist. Tunable targets/time-budgets at the bottom.

2. **`curated.js`** — a hand-authored list of named mating patterns (Smothered,
   Arabian, Epaulette, Scholar's, Légal's, Back Rank, Promotion…). Each is re-verified
   as an exact forced mate before it is emitted; unverified entries are dropped.

3. **`build.js`** — merges curated + legacy + generated pools, re-verifies legality and
   checkmate for **every** puzzle, assigns rating → difficulty tier, theme tags and a
   teaching explanation, dedupes, sorts by rating, and writes the final `puzzles.ts`.

Run with `NODE_PATH` pointed at the app's `node_modules` (for `chess.js`):

```bash
export NODE_PATH="$(pwd)/node_modules"
node scripts/generate-puzzles/generate.js /tmp/out.json
node scripts/generate-puzzles/curated.js  > /tmp/curated.json
node scripts/generate-puzzles/build.js            # emits puzzles.ts
```

> The `build.js` `DIR` constant points at the working directory holding the JSON
> artifacts — adjust it to wherever you wrote `out.json` / `curated.json`.

## Admin runtime tools

The `/admin/puzzles` panel (add / edit / delete / search / filter / bulk-import) plus
the `admin_*_puzzle` RPCs in `supabase/migrations_puzzles.sql` let you manage the
database-backed puzzle set at runtime. The app reads DB puzzles when present and falls
back to the bundled verified set otherwise; use the panel's **Seed Bundled** button to
push this verified set into the database.
