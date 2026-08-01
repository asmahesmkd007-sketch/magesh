// =====================================================================
// LIVE GAMEPLAY WIRE PROTOCOL
// ---------------------------------------------------------------------
// The single contract shared by the Socket.IO server and the browser
// client. Both sides import these types, so a change to a payload is a
// compile error on the other end rather than a runtime surprise.
//
// Design rules this protocol follows:
//
//   * The server is the only authority. Every client->server message is
//     a *request*; every server->client message is a *fact*. Clients
//     never tell the server what the position or the clock is.
//   * Every state-bearing message carries `serverTime`, so the client
//     can hold a clock offset and render time without trusting its own
//     wall clock relative to the server's.
//   * Every applied move carries `ply`, so a client can detect a gap and
//     ask for a full resync instead of silently diverging.
//   * Snapshots are complete. `game:state` is everything needed to draw
//     the board from nothing, which is what makes reconnect and late
//     spectator joins the same code path as a first load.
// =====================================================================

export type Color = "w" | "b";
export type Promotion = "q" | "r" | "b" | "n";
export type GameStatus = "waiting" | "active" | "finished" | "aborted";
export type GameResult = "white" | "black" | "draw" | "ongoing" | "aborted";

/** Socket.IO handshake auth payload. */
export type HandshakeAuth = {
  /** Supabase access token. Verified exactly like an HTTP request's bearer token. */
  token?: string;
};

// ── Server -> client ──────────────────────────────────────────────────

/**
 * The authoritative clock, as banked values plus the instant the running
 * side's turn began. Identical in shape to what `clockFromServer` already
 * consumes, so the existing rendering path is reused unchanged.
 */
export type ClockSnapshot = {
  whiteMs: number;
  blackMs: number;
  /** Whose clock is counting, or null when stopped (waiting/finished). */
  running: Color | null;
  /** Server epoch ms at which the running side's turn began. */
  since: number;
  incrementMs: number;
  /** A game with no timer never flags. */
  untimed: boolean;
};

export type MovePayload = {
  ply: number;
  san: string;
  uci: string;
  from: string;
  to: string;
  promotion?: Promotion;
  fenAfter: string;
  /** Server epoch ms the move was accepted. */
  at: number;
  /** Milliseconds the mover spent on it. */
  tookMs: number;
  by: string | null;
};

export type ChatPayload = {
  id: string;
  userId: string;
  username: string;
  body: string;
  at: number;
};

export type TerminalPayload = {
  status: "finished";
  result: GameResult;
  endReason: string;
  winnerId: string | null;
  /** Present once ratings have been recomputed and persisted. */
  ratings?: { whiteRating: number | null; blackRating: number | null } | null;
};

/**
 * A complete, self-contained view of a game. Sent on join, on reconnect,
 * and whenever the client asks to resync — the three cases are one code
 * path precisely because this payload is total.
 */
export type GameStateSnapshot = {
  gameId: string;
  status: GameStatus;
  result: GameResult;
  endReason: string | null;
  winnerId: string | null;
  fen: string;
  turn: Color;
  /** Full move list, oldest first. */
  moves: MovePayload[];
  clock: ClockSnapshot;
  white: SeatInfo;
  black: SeatInfo;
  drawOfferedBy: string | null;
  chat: ChatPayload[];
  isRated: boolean;
  timeControl: string;
  /** Seconds this viewer's feed is held back (0 for players). */
  delaySeconds: number;
  /** Server epoch ms when this snapshot was produced. */
  serverTime: number;
};

export type SeatInfo = {
  userId: string | null;
  username: string | null;
  rating: number | null;
};

/** Everything the server can send. */
export type ServerToClientEvents = {
  "game:state": (snapshot: GameStateSnapshot) => void;
  "game:move": (payload: {
    gameId: string;
    move: MovePayload;
    clock: ClockSnapshot;
    serverTime: number;
  }) => void;
  "game:end": (payload: {
    gameId: string;
    terminal: TerminalPayload;
    clock: ClockSnapshot;
    serverTime: number;
  }) => void;
  "game:draw-offer": (payload: { gameId: string; offeredBy: string | null }) => void;
  "game:chat": (payload: { gameId: string; message: ChatPayload }) => void;
  /**
   * A request was refused. `code` is stable and machine-readable; the
   * accompanying snapshot lets the client snap back to the truth without
   * a second round-trip.
   */
  "game:rejected": (payload: {
    gameId: string;
    code: RejectCode;
    message: string;
    snapshot: GameStateSnapshot | null;
  }) => void;
  /** Opponent presence, for the "reconnecting…" affordance. */
  "game:presence": (payload: { gameId: string; userId: string; online: boolean }) => void;
  "game:rematch-offer": (payload: { gameId: string; offeredBy: string }) => void;
  "game:rematch-accepted": (payload: { gameId: string; newGameId: string }) => void;
  "game:rematch-declined": (payload: { gameId: string }) => void;
};

export type RejectCode =
  | "not_authenticated"
  | "not_found"
  | "not_a_player"
  | "not_your_turn"
  | "illegal_move"
  | "game_not_active"
  | "rate_limited"
  | "out_of_time"
  | "banned"
  | "internal";

// ── Client -> server ──────────────────────────────────────────────────

/**
 * Acks are used for every request so the client learns the outcome even
 * when the corresponding broadcast is filtered out for it (a spectator's
 * delayed feed, for instance).
 */
export type Ack<T> = (
  response: { ok: true; data: T } | { ok: false; code: RejectCode; message: string },
) => void;

export type ClientToServerEvents = {
  /** Join as player or spectator; the server decides which from the seat list. */
  "game:join": (payload: { gameId: string }, ack: Ack<GameStateSnapshot>) => void;
  "game:leave": (payload: { gameId: string }) => void;
  /** Ask for a fresh snapshot — used after a detected ply gap. */
  "game:resync": (payload: { gameId: string }, ack: Ack<GameStateSnapshot>) => void;
  "game:move": (
    payload: { gameId: string; from: string; to: string; promotion?: Promotion },
    ack: Ack<{ move: MovePayload; clock: ClockSnapshot }>,
  ) => void;
  "game:resign": (payload: { gameId: string }, ack: Ack<TerminalPayload>) => void;
  /** Offer a draw, or accept the opponent's pending offer. */
  "game:draw": (
    payload: { gameId: string },
    ack: Ack<{ state: "offered" | "accepted" | "declined" }>,
  ) => void;
  "game:draw-decline": (payload: { gameId: string }, ack?: Ack<{ state: "declined" }>) => void;
  "game:chat": (payload: { gameId: string; body: string }, ack: Ack<ChatPayload>) => void;
  "game:rematch-offer": (
    payload: { gameId: string },
    ack: Ack<{ status: "offered" | "accepted"; newGameId?: string }>,
  ) => void;
  "game:rematch-decline": (payload: { gameId: string }) => void;
  /** Round-trip probe for clock offset estimation. */
  "time:sync": (
    payload: { clientTime: number },
    ack: Ack<{ serverTime: number; clientTime: number }>,
  ) => void;
};

/** Room naming — one place so server and any tooling agree. */
export const rooms = {
  /** Players only: full-speed feed. */
  players: (gameId: string) => `game:${gameId}:players`,
  /** Spectators: same feed, optionally held back by the broadcast delay. */
  spectators: (gameId: string) => `game:${gameId}:spectators`,
};

/** Socket.IO path — same origin, so no CORS and no extra host. */
export const SOCKET_PATH = "/realtime";

/** Max chat body length, mirroring the game_chat CHECK constraint. */
export const MAX_CHAT_LENGTH = 500;
