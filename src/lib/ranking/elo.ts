// =====================================================================
// Permanent ELO — rating maths and display bands
// ---------------------------------------------------------------------
// ELO answers "how strong is this player?" and never resets. The server
// (public.apply_elo_change in schema.sql) is the sole authority for
// writing ratings; this module mirrors the formula so the client can
// show "what's at stake" before a game and label a rating with a band.
//
// Rating is tracked per time class (bullet/blitz/rapid/classical), so a
// player has several ELOs. Leaderboards pick one class at a time.
// =====================================================================

/** Rating every new player starts on (mirrors ratings.rating default). */
export const BASE_RATING = 100;

/**
 * K-factor schedule. Provisional players (few games) move fast so they
 * find their level quickly; established and elite players move slowly
 * so the top of the ladder is stable. Mirrors public.elo_k_factor().
 */
export function kFactor(rating: number, gamesPlayed: number): number {
  if (gamesPlayed < 15) return 40; // provisional
  if (rating >= 2400) return 12; // elite
  if (rating >= 1800) return 20;
  return 24;
}

/** Probability that `rating` scores against `opponentRating` (0–1). */
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

export type EloOutcome = "win" | "draw" | "loss";

const SCORE: Record<EloOutcome, number> = { win: 1, draw: 0.5, loss: 0 };

/** The rating delta a result would produce. Positive means a gain. */
export function ratingDelta(opts: {
  rating: number;
  opponentRating: number;
  outcome: EloOutcome;
  gamesPlayed?: number;
}): number {
  const k = kFactor(opts.rating, opts.gamesPlayed ?? 100);
  const expected = expectedScore(opts.rating, opts.opponentRating);
  return Math.round(k * (SCORE[opts.outcome] - expected));
}

/** All three outcomes at once — for the "at stake" strip before a game. */
export function ratingStakes(opts: {
  rating: number;
  opponentRating: number;
  gamesPlayed?: number;
}): Record<EloOutcome, number> {
  return {
    win: ratingDelta({ ...opts, outcome: "win" }),
    draw: ratingDelta({ ...opts, outcome: "draw" }),
    loss: ratingDelta({ ...opts, outcome: "loss" }),
  };
}

// ── Display bands ────────────────────────────────────────────────────
// Purely cosmetic labels for an ELO number. Distinct from Season Point
// tiers (see tiers.ts) — a player can be Bronze this season and still
// carry an Expert rating, because the two systems answer different
// questions.

export type EloBand = {
  name: string;
  min: number;
  max: number | null;
  text: string;
  badge: string;
};

export const ELO_BANDS: EloBand[] = [
  {
    name: "Novice",
    min: 0,
    max: 600,
    text: "text-zinc-400",
    badge: "border-zinc-500/30 bg-zinc-500/10",
  },
  {
    name: "Casual",
    min: 600,
    max: 1000,
    text: "text-stone-300",
    badge: "border-stone-400/30 bg-stone-400/10",
  },
  {
    name: "Club",
    min: 1000,
    max: 1400,
    text: "text-emerald-400",
    badge: "border-emerald-500/30 bg-emerald-500/10",
  },
  {
    name: "Advanced",
    min: 1400,
    max: 1800,
    text: "text-sky-400",
    badge: "border-sky-500/30 bg-sky-500/10",
  },
  {
    name: "Expert",
    min: 1800,
    max: 2200,
    text: "text-violet-400",
    badge: "border-violet-500/30 bg-violet-500/10",
  },
  {
    name: "Candidate Master",
    min: 2200,
    max: 2500,
    text: "text-rose-400",
    badge: "border-rose-500/30 bg-rose-500/10",
  },
  { name: "Elite", min: 2500, max: null, text: "text-gold", badge: "border-gold/40 bg-gold/10" },
];

export function bandOf(rating: number): EloBand {
  for (let i = ELO_BANDS.length - 1; i >= 0; i--) {
    if (rating >= ELO_BANDS[i].min) return ELO_BANDS[i];
  }
  return ELO_BANDS[0];
}

export type TimeClass = "bullet" | "blitz" | "rapid" | "classical" | "correspondence";

export const TIME_CLASS_LABELS: Record<TimeClass, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  classical: "Classical",
  correspondence: "Daily",
};

/** Time classes that carry a public leaderboard, in display order. */
export const RANKED_TIME_CLASSES: TimeClass[] = ["bullet", "blitz", "rapid", "classical"];

/** Win rate as a percentage, or null when no games have been played. */
export function winRate(wins: number, losses: number, draws: number): number | null {
  const total = wins + losses + draws;
  if (total === 0) return null;
  // Draws count as half a win — the standard chess convention.
  return Math.round(((wins + draws / 2) / total) * 1000) / 10;
}
