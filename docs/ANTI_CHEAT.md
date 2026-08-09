# ChessOx — Anti-Cheat System

A fair-play system built on one principle: **collect evidence, score risk,
let humans decide.** Nothing in this system bans a player automatically.

## Design rules

1. **Never trust the client.** Move legality, clocks, results and turn order are
   settled server-side (`makeMove` + `SECURITY DEFINER` RPCs). Client telemetry
   is treated as a _claim_ — it is evidence about behavior, never authority over
   game state.
2. **Never block gameplay.** Every anti-cheat call on the move path is fired
   with `void`. Detection listeners are passive, periodic checks are
   idle-scheduled, reports are batched, and the detector module is code-split so
   it isn't even downloaded until a real game starts.
3. **Never auto-ban.** Detection produces _events_ and _flags_. Enforcement is a
   separate, admin-driven step gated by a multi-indicator rule that the server
   enforces (`enforcementAllowed` in `risk.ts`) — the dashboard cannot bypass it.
4. **Never delete evidence.** Anti-cheat tables have no cascading deletes and no
   automatic cleanup.

## Module map

| Module                                 | Runs   | Responsibility                                              |
| -------------------------------------- | ------ | ----------------------------------------------------------- |
| `lib/anticheat/types.ts`               | both   | Event vocabulary, severities, risk levels, row shapes       |
| `lib/anticheat/config.ts`              | both   | Every threshold and weight — the single tuning surface      |
| `lib/anticheat/risk.ts`                | both   | **The only** risk-score implementation + enforcement gate   |
| `lib/anticheat/detector.client.ts`     | client | Browser signal collection + batched reporting               |
| `lib/anticheat/fingerprint.client.ts`  | client | Coarse device fingerprint (no canvas/audio probing)         |
| `lib/anticheat/useAntiCheatMonitor.ts` | client | Game-page integration (players only, never spectators)      |
| `lib/anticheat/anticheat.functions.ts` | server | Wire endpoints: ingestion, fingerprints, admin mutations    |
| `lib/anticheat/ingest.server.ts`       | server | Evidence writes, risk updates, flags, multi-account, alerts |
| `lib/anticheat/analysis.server.ts`     | server | Post-game engine/timing/connection analysis pipeline        |
| `lib/anticheat/engineAnalysis.ts`      | pure   | ACPL, accuracy, engine-match %, streaks → findings          |
| `lib/anticheat/timeAnalysis.ts`        | pure   | Cadence, impossible speed, think-then-instant, clock checks |
| `routes/admin.anticheat.tsx`           | client | Admin review dashboard                                      |

## What is detected

**Client (evidence only):** tab switching, focus loss, minimize/restore churn,
multiple ChessOX tabs (and same-game tabs), refresh and back-navigation during a
game, DevTools (size heuristic + shortcuts), console tampering, native-function
overrides, foreign script/iframe injection, timer throttling, wall-clock skew,
synthetic (`isTrusted: false`) input, macro click cadence, impossible reaction
times, idle-then-instant replies, connection drops.

**Server (authoritative):** illegal moves, out-of-turn moves, moves into games
the caller isn't seated in, moves from suspended accounts, duplicate/replayed
plies, move-rate abuse, sub-human think times.

**Post-game analysis:** engine-match %, ACPL, accuracy, best-move streaks,
instant engine-best moves, rating-relative improvement, uniform move times,
long-think→instant sequences, clock/think-time disagreement, disconnect and
reconnect abuse.

**Account:** shared device fingerprints and IP overlap → flagged for review only.

## Risk scoring

Each event/flag adds to a per-category _raw accumulator_. Categories saturate
toward a cap and decay exponentially (`half-life` per category), so the score is
recent-behavior weighted and self-healing:

```
score(category) = cap · (1 − e^(−raw / k))
total           = Σ score(category), clamped to 100
```

| Category   | Cap | Half-life |
| ---------- | --- | --------- |
| engine     | 45  | 30 days   |
| timing     | 25  | 30 days   |
| behavior   | 15  | 10 days   |
| connection | 15  | 10 days   |
| account    | 20  | 45 days   |

Bands: **0-20** Safe · **21-40** Monitor · **41-60** Warning · **61-80** Review ·
**81-100** High Risk.

The caps are the structural false-positive guard: **no single category can reach
61 on its own**, so a player cannot enter the Review band without corroboration
from more than one kind of evidence, no matter how much of one signal they
generate.

## Enforcement policy (server-enforced)

| Action                | Requirement                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Warning / restriction | ≥ 1 active flag, **or** risk score ≥ 41                                                       |
| Suspension / ban      | ≥ 2 active flags across ≥ 2 distinct indicator types, **or** 1 confirmed flag with score > 60 |
| Unban / risk reset    | Always permitted                                                                              |

Dismissing a flag as a false positive **subtracts** its contribution back out of
the score through the same scoring path that added it.

## Admin workflow

`/admin/anticheat` → Overview (live flagged games, counts) · Flags (review queue:
confirm / dismiss) · Players (risk-ranked). Opening a player shows the risk
breakdown, flags, merged evidence timeline, engine metrics, per-move time graph,
device and shared-account info, reports, review history and the enforcement log.

Admins are notified for: high-risk escalation, engine abuse, timer manipulation,
connection abuse, multi-account overlap, and repeated flagged games. Alerts are
deduped per (user, kind) for an hour.

## Performance

- Move path: zero added awaits (all `void`-fired).
- Client: passive listeners, idle-scheduled sweeps, ~12s batched flushes,
  detector lazily loaded (~10 KB) only for active players.
- Failed flushes persist to `localStorage` and retry next session.
- Post-game engine replay yields to the event loop between plies and is claimed
  atomically via a partial unique index, so it never runs twice for a game.

## Tuning

All thresholds live in `ANTICHEAT_CONFIG` (`lib/anticheat/config.ts`). Setting
`enabled: false` disables client reporting and analysis without code changes.

## Tests

`risk.test.ts` (scoring, decay, false-positive protection, enforcement gate),
`analysis.test.ts` (engine + timing detection with normal/strong/cheating player
profiles), `detector.test.ts` (browser signal collection in jsdom).
