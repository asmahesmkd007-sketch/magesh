// =====================================================================
// SPECTATOR MODE — shared types
// ---------------------------------------------------------------------
// The wire shapes returned by the spectator RPCs (schema.sql SECTION
// 104). These mirror the jsonb built by get_spectator_game() and
// list_live_games() field for field; if you change one, change both.
//
// Note what is NOT here: there is no "current fen" separate from the
// delayed one. A spectator payload only ever carries the position as of
// the delay cutoff, because that is all the database will hand out.
// =====================================================================

export type SpectatorVisibility = "public" | "friends" | "private";

export type TimeClass = "bullet" | "blitz" | "rapid" | "classical" | "correspondence";

/** One ply, as released by the delayed feed. */
export type SpectatorMove = {
  ply: number;
  san: string;
  uci: string;
  fen_after: string;
  time_left_ms: number | null;
  created_at: string;
};

/** A player as shown on the live match card. */
export type SpectatorPlayer = {
  id: string | null;
  username: string | null;
  rating: number | null;
  avatar_url: string | null;
  country: string | null;
  title: string | null;
  premium_tier: string | null;
  /** Season Points in the currently live season, if the player has any. */
  season_points: number | null;
  /** Ladder rung id, e.g. "diamond_2". Null outside a live season. */
  rung_id: string | null;
  /** Remaining clock as of the delayed position, in ms. */
  time_ms: number;
};

export type SpectatorTournament = {
  tournament_id: string;
  name: string;
  slug: string;
  round: number;
  is_final: boolean;
};

/** The full delayed snapshot — one poll of get_spectator_game(). */
export type SpectatorGame = {
  id: string;
  /** True when the viewer is one of the two players (feed is undelayed). */
  is_player: boolean;
  /** Delay applied to this feed, in seconds. 0 for players and finished games. */
  delay_seconds: number;
  /** Plies played but still embargoed. > 0 means the game is ahead of you. */
  moves_behind: number;
  /** Server clock at the moment of the snapshot; used to correct local drift. */
  server_time: string;

  white: SpectatorPlayer;
  black: SpectatorPlayer;

  fen: string;
  turn: "w" | "b";
  moves_count: number;
  last_move_at: string | null;
  moves: SpectatorMove[];

  status: "waiting" | "active" | "finished";
  result: "white" | "black" | "draw" | "ongoing" | "aborted";
  winner_id: string | null;
  end_reason: string | null;

  time_class: TimeClass;
  time_control: string;
  initial_seconds: number;
  increment_seconds: number;
  is_rated: boolean;
  opening: string | null;
  started_at: string;
  viewers: number;
  tournament: SpectatorTournament | null;
};

/** The player fields a browse card needs — no clock, since there is no position. */
export type LiveMatchPlayer = Pick<
  SpectatorPlayer,
  "id" | "username" | "rating" | "avatar_url" | "country" | "title" | "season_points" | "rung_id"
>;

/** A row in the /watch browse grid. Carries no position, by construction. */
export type LiveMatchSummary = {
  id: string;
  white: LiveMatchPlayer;
  black: LiveMatchPlayer;
  time_class: TimeClass;
  time_control: string;
  is_rated: boolean;
  moves_count: number;
  opening: string | null;
  started_at: string;
  viewers: number;
  avg_rating: number;
  featured: boolean;
  tournament: SpectatorTournament | null;
};

export type LiveGameSort = "featured" | "viewers" | "rating" | "recent";
