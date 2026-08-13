import { describe, expect, it } from "vitest";

import {
  hasAlreadyFlagged,
  rejoinDecision,
  rejoinableGames,
  type RejoinGameRow,
} from "./eligibility";

const ME = "11111111-1111-4111-8111-111111111111";
const OPPONENT = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";

const NOW = Date.UTC(2026, 7, 13, 12, 0, 0);

function row(overrides: Partial<RejoinGameRow> = {}): RejoinGameRow {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "active",
    white_id: ME,
    black_id: OPPONENT,
    white_username: "me",
    black_username: "them",
    // Five minutes each, banked as of last_move_at.
    white_time_ms: 300_000,
    black_time_ms: 300_000,
    last_move_at: new Date(NOW - 10_000).toISOString(),
    initial_seconds: 300,
    increment_seconds: 0,
    turn: "w",
    moves_count: 12,
    time_control: "5+0",
    is_rated: true,
    vs_computer: false,
    ...overrides,
  };
}

describe("rejoin eligibility — membership and authorization", () => {
  it("lets a seated player rejoin their own active game, with their real colour", () => {
    expect(rejoinDecision(row(), ME, NOW)).toEqual({
      ok: true,
      gameId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      color: "w",
    });
    expect(rejoinDecision(row(), OPPONENT, NOW)).toMatchObject({ ok: true, color: "b" });
  });

  it("refuses a user who is not a player in the game", () => {
    expect(rejoinDecision(row(), STRANGER, NOW)).toEqual({ ok: false, reason: "not_a_player" });
  });

  it("refuses an unauthenticated caller outright", () => {
    expect(rejoinDecision(row(), null, NOW)).toEqual({ ok: false, reason: "not_authenticated" });
    expect(rejoinDecision(row(), undefined, NOW)).toEqual({
      ok: false,
      reason: "not_authenticated",
    });
  });

  it("refuses a game that does not exist", () => {
    expect(rejoinDecision(null, ME, NOW)).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("rejoin eligibility — lifecycle", () => {
  it("never resurrects a finished game", () => {
    expect(rejoinDecision(row({ status: "finished" }), ME, NOW)).toEqual({
      ok: false,
      reason: "not_active",
    });
  });

  it("never resurrects an aborted/abandoned game", () => {
    expect(rejoinDecision(row({ status: "aborted" }), ME, NOW)).toEqual({
      ok: false,
      reason: "not_active",
    });
  });

  it("does not offer a waiting seat as a match in progress", () => {
    expect(rejoinDecision(row({ status: "waiting", black_id: null }), ME, NOW)).toEqual({
      ok: false,
      reason: "not_active",
    });
  });

  it("refuses a game whose clock already ran out while nobody was connected", () => {
    // White is to move with 5s banked, and the turn began 60s ago.
    const expired = row({
      white_time_ms: 5_000,
      last_move_at: new Date(NOW - 60_000).toISOString(),
    });
    expect(hasAlreadyFlagged(expired, NOW)).toBe(true);
    expect(rejoinDecision(expired, ME, NOW)).toEqual({ ok: false, reason: "expired" });
  });

  it("does not treat an untimed game as expired however long it sits", () => {
    const untimed = row({
      initial_seconds: 0,
      white_time_ms: 0,
      black_time_ms: 0,
      last_move_at: new Date(NOW - 30 * 24 * 3600_000).toISOString(),
    });
    expect(hasAlreadyFlagged(untimed, NOW)).toBe(false);
    expect(rejoinDecision(untimed, ME, NOW)).toMatchObject({ ok: true });
  });

  it("counts elapsed time against the side to move only", () => {
    // Black is to move and is the one burning time; White's bank is safe.
    const blackToMove = row({
      turn: "b",
      black_time_ms: 5_000,
      white_time_ms: 1_000,
      last_move_at: new Date(NOW - 60_000).toISOString(),
    });
    expect(hasAlreadyFlagged(blackToMove, NOW)).toBe(true);

    const whiteSafe = row({
      turn: "b",
      black_time_ms: 300_000,
      white_time_ms: 1_000,
      last_move_at: new Date(NOW - 60_000).toISOString(),
    });
    expect(hasAlreadyFlagged(whiteSafe, NOW)).toBe(false);
  });
});

describe("rejoinableGames — the returning-user list", () => {
  it("returns exactly the caller's live boards, newest activity first", () => {
    const older = row({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      last_move_at: new Date(NOW - 120_000).toISOString(),
    });
    const newer = row({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      last_move_at: new Date(NOW - 5_000).toISOString(),
    });
    const notMine = row({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      white_id: STRANGER,
      black_id: OPPONENT,
    });
    const done = row({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", status: "finished" });

    const result = rejoinableGames([older, notMine, newer, done], ME, NOW);
    expect(result.map((g) => g.gameId)).toEqual([newer.id, older.id]);
  });

  it("carries the metadata the prompt shows, and invents none", () => {
    const [game] = rejoinableGames([row()], ME, NOW);
    expect(game).toEqual({
      gameId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      color: "w",
      whiteUsername: "me",
      blackUsername: "them",
      timeControl: "5+0",
      isRated: true,
      movesCount: 12,
      lastMoveAt: NOW - 10_000,
    });
  });

  it("excludes engine games, which are only ever written once finished", () => {
    expect(rejoinableGames([row({ vs_computer: true })], ME, NOW)).toEqual([]);
  });

  it("returns nothing at all for a signed-out caller", () => {
    expect(rejoinableGames([row()], null, NOW)).toEqual([]);
  });

  it("keeps offering the same game while it stays rejoinable", () => {
    // The rule is a pure function of server state: a later visit with the
    // game unchanged produces the same offer. Nothing is consumed by
    // having asked once.
    const rows = [row()];
    const first = rejoinableGames(rows, ME, NOW);
    const later = rejoinableGames(rows, ME, NOW + 60_000);
    expect(first.map((g) => g.gameId)).toEqual(later.map((g) => g.gameId));
  });
});
