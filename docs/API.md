# ChessOx — API Reference

All game/matchmaking actions are exposed through the typed service layer in
`src/lib/api/gameClient.ts`. Prefer these wrappers over calling `supabase.rpc`
directly.

## Server function

### `submitMove({ gameId, from, to, promotion? })`

Server-authoritative move. Validates the move against the stored FEN with
chess.js, recomputes clocks from server timestamps, detects mate/draw/timeout,
and commits with the service role. Rate-limited to 10 moves/sec/user.
Backed by `makeMove` in `src/lib/api/game.functions.ts`.

- **Auth:** required (`requireSupabaseAuth`).
- **Requires:** `SUPABASE_SERVICE_ROLE_KEY` in the server env.
- **Returns:** `{ ok, status, result, fen, turn, endReason }`.
- **Throws:** `Not your turn`, `Illegal move`, `Game is not active`, `Too many moves`.

## RPCs (SECURITY DEFINER, callable by authenticated users)

| Service fn                | RPC                  | Purpose                                            | Returns                                 |
| ------------------------- | -------------------- | -------------------------------------------------- | --------------------------------------- |
| `createChallenge(opts)`   | `create_challenge`   | Create a private waiting game                      | `gameId`                                |
| `joinGame(id)`            | `join_game`          | Take the open seat (row-locked)                    | `gameId`                                |
| `matchmake(opts)`         | `matchmake`          | Pair with a waiting player or enqueue              | `gameId \| null`                        |
| `leaveQueue()`            | `leave_queue`        | Remove self from the queue                         | `void`                                  |
| `resignGame(id)`          | `resign_game`        | Resign; applies Elo                                | `void`                                  |
| `respondDraw(id)`         | `respond_draw`       | Offer or accept a draw                             | `'offered' \| 'accepted' \| 'inactive'` |
| `claimTimeout(id)`        | `claim_timeout`      | Claim win on opponent flag (server verifies clock) | `boolean`                               |
| `saveComputerGame(input)` | `save_computer_game` | Persist a finished unrated bot game                | `gameId`                                |

`ChallengeOptions = { timeClass, timeControl, initialSeconds, incrementSeconds, isRated, hostColor }`.

### Validation & guards

- Every RPC checks `auth.uid()` and only acts for the caller.
- `join_game` / `resign_game` / `respond_draw` / `claim_timeout` lock the game row (`FOR UPDATE`) to avoid races.
- `matchmake` uses `FOR UPDATE SKIP LOCKED` so concurrent searchers don't pair with the same opponent.
- `claim_timeout` independently recomputes elapsed time vs the stored clock — a premature claim is a no-op.
- Ratings are applied only by `apply_elo_change`, which is idempotent (`elo_applied` guard) and trusts only server-set results.

## Health

`GET /healthz` (or `/api/health`) → `{ status: "ok", ts }`. Used by the Docker healthcheck and uptime monitors.
