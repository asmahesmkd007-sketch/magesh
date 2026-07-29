// =====================================================================
// Season Points (SP) tier ladder — Bronze → Grandmaster, 3 divisions each
// ---------------------------------------------------------------------
// The competitive ladder for seasonal play. Mirrors public.sp_rung() and
// public.season_config in schema.sql (SECTION 102) — the SERVER IS THE
// SOLE AUTHORITY for awarding points and setting a player's rung; this
// module exists so the UI can render tiers, thresholds and progress
// without a round trip, and so the earn rates are documented in one
// readable place.
//
// Two numbers describe a player's standing:
//   • Season Points (SP) — earned per rated game, reset every season.
//   • Rung             — the (tier, division) the SP falls into.
//
// Earn rates get harsher as the tier rises: a Bronze win pays 30 and a
// loss costs 8; a Grandmaster win pays 18 and a loss costs 20. Climbing
// therefore requires a genuinely positive score at the top, while new
// players climb quickly out of the entry tiers.
// =====================================================================

export type TierCode =
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond"
  | "master"
  | "grandmaster";

/** Divisions run III (entry) → I (highest) within each tier. */
export type Division = 1 | 2 | 3;

export type Tier = {
  code: TierCode;
  name: string;
  /** 0-based ladder position; higher is stronger. Used for upset bonuses. */
  order: number;
  /** SP awarded/deducted for players *in* this tier. */
  rates: { win: number; draw: number; loss: number };
  /** Tailwind text class for the tier's identity colour. */
  text: string;
  /** Tailwind border+background for badges/chips. */
  badge: string;
  /** Progress-bar fill class. */
  bar: string;
  /** Ring/glow accent used on the large profile badge. */
  glow: string;
};

export const TIERS: Tier[] = [
  {
    code: "bronze",
    name: "Bronze",
    order: 0,
    rates: { win: 30, draw: 10, loss: -8 },
    text: "text-amber-700",
    badge: "border-amber-700/40 bg-amber-700/10",
    bar: "bg-amber-700",
    glow: "shadow-[0_0_24px_rgba(180,83,9,0.35)]",
  },
  {
    code: "silver",
    name: "Silver",
    order: 1,
    rates: { win: 28, draw: 9, loss: -10 },
    text: "text-slate-300",
    badge: "border-slate-300/40 bg-slate-300/10",
    bar: "bg-slate-300",
    glow: "shadow-[0_0_24px_rgba(203,213,225,0.35)]",
  },
  {
    code: "gold",
    name: "Gold",
    order: 2,
    rates: { win: 26, draw: 8, loss: -12 },
    text: "text-gold",
    badge: "border-gold/40 bg-gold/10",
    bar: "gradient-gold",
    glow: "shadow-[0_0_28px_rgba(212,175,55,0.45)]",
  },
  {
    code: "platinum",
    name: "Platinum",
    order: 3,
    rates: { win: 24, draw: 7, loss: -14 },
    text: "text-teal-300",
    badge: "border-teal-300/40 bg-teal-300/10",
    bar: "bg-teal-300",
    glow: "shadow-[0_0_28px_rgba(94,234,212,0.4)]",
  },
  {
    code: "diamond",
    name: "Diamond",
    order: 4,
    rates: { win: 22, draw: 6, loss: -16 },
    text: "text-sky-400",
    badge: "border-sky-400/40 bg-sky-400/10",
    bar: "bg-sky-400",
    glow: "shadow-[0_0_28px_rgba(56,189,248,0.45)]",
  },
  {
    code: "master",
    name: "Master",
    order: 5,
    rates: { win: 20, draw: 5, loss: -18 },
    text: "text-violet-400",
    badge: "border-violet-400/40 bg-violet-400/10",
    bar: "bg-violet-400",
    glow: "shadow-[0_0_28px_rgba(167,139,250,0.45)]",
  },
  {
    code: "grandmaster",
    name: "Grandmaster",
    order: 6,
    rates: { win: 18, draw: 4, loss: -20 },
    text: "text-rose-400",
    badge: "border-rose-400/40 bg-rose-400/10",
    bar: "bg-rose-400",
    glow: "shadow-[0_0_32px_rgba(251,113,133,0.5)]",
  },
];

export const TIER_BY_CODE: Record<TierCode, Tier> = Object.fromEntries(
  TIERS.map((t) => [t.code, t]),
) as Record<TierCode, Tier>;

/** One rung of the ladder: a tier + division with its SP entry threshold. */
export type Rung = {
  tier: Tier;
  division: Division;
  /** SP required to stand on this rung. */
  minSp: number;
  /** SP that promotes to the next rung; null on the apex rung. */
  nextSp: number | null;
  /** 0-based index across the whole 21-rung ladder. */
  index: number;
  /** "Gold II" */
  label: string;
  /** Stable id used in the database and in reward codes: "gold_2". */
  id: string;
};

const ROMAN: Record<Division, string> = { 3: "III", 2: "II", 1: "I" };

/**
 * SP thresholds for each rung, in ladder order. Tuned so a casual
 * player (≈90 games, 50% score) lands mid-Silver, a strong regular
 * (≈150 games, 70%) reaches Platinum, and Grandmaster requires both
 * volume and a high win rate across the month.
 */
const THRESHOLDS: number[] = [
  0,
  150,
  300, // Bronze  III → I
  500,
  700,
  900, // Silver
  1150,
  1400,
  1650, // Gold
  1950,
  2250,
  2550, // Platinum
  2900,
  3250,
  3600, // Diamond
  4000,
  4400,
  4800, // Master
  5300,
  5800,
  6300, // Grandmaster
];

export const LADDER: Rung[] = THRESHOLDS.map((minSp, index) => {
  const tier = TIERS[Math.floor(index / 3)];
  const division = (3 - (index % 3)) as Division;
  return {
    tier,
    division,
    minSp,
    nextSp: index + 1 < THRESHOLDS.length ? THRESHOLDS[index + 1] : null,
    index,
    label: `${tier.name} ${ROMAN[division]}`,
    id: `${tier.code}_${division}`,
  };
});

export const APEX_RUNG = LADDER[LADDER.length - 1];

/**
 * How far SP must fall *below* a rung's threshold before the player is
 * demoted off it. Prevents yo-yoing on the boundary after a single loss.
 * Mirrors season_config.demotion_grace_sp (default 50).
 */
export const DEMOTION_GRACE_SP = 50;

/** The rung a raw SP total sits on. */
export function rungOf(sp: number): Rung {
  for (let i = LADDER.length - 1; i >= 0; i--) {
    if (sp >= LADDER[i].minSp) return LADDER[i];
  }
  return LADDER[0];
}

/** Look up a rung by its stable id ("gold_2"); null when unknown. */
export function rungById(id: string | null | undefined): Rung | null {
  if (!id) return null;
  return LADDER.find((r) => r.id === id) ?? null;
}

export function tierOf(sp: number): Tier {
  return rungOf(sp).tier;
}

/** The next rung up, or null at the apex. */
export function nextRung(sp: number): Rung | null {
  const cur = rungOf(sp);
  return cur.index + 1 < LADDER.length ? LADDER[cur.index + 1] : null;
}

/** 0–100 progress through the current rung toward the next one. */
export function rungProgress(sp: number): number {
  const rung = rungOf(sp);
  if (rung.nextSp === null) return 100;
  const span = rung.nextSp - rung.minSp;
  if (span <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((sp - rung.minSp) / span) * 100)));
}

/** SP still needed to reach the next rung; null at the apex. */
export function spToNextRung(sp: number): number | null {
  const rung = rungOf(sp);
  return rung.nextSp === null ? null : Math.max(0, rung.nextSp - sp);
}

// ── Award preview ────────────────────────────────────────────────────

export type GameOutcome = "win" | "draw" | "loss";

/**
 * Upset bonus for beating a higher-tier opponent, by tier gap.
 * Mirrors season_config.upset_bonus.
 */
export const UPSET_BONUS: Record<number, number> = { 1: 3, 2: 5, 3: 8 };

export function upsetBonusFor(playerTier: Tier, opponentTier: Tier): number {
  const gap = opponentTier.order - playerTier.order;
  if (gap <= 0) return 0;
  return UPSET_BONUS[Math.min(3, gap)] ?? 0;
}

/** Conduct penalties, applied on top of the result. */
export type PenaltyKind = "disconnect" | "timeout" | "afk" | "cheating";

export const PENALTIES: Record<PenaltyKind, number> = {
  disconnect: -20,
  timeout: -15,
  afk: -20,
  cheating: -100,
};

export const PENALTY_LABELS: Record<PenaltyKind, string> = {
  disconnect: "Disconnected",
  timeout: "Time forfeit",
  afk: "Inactivity (AFK)",
  cheating: "Fair-play violation",
};

/**
 * Preview the SP a game would pay. The server recomputes this
 * authoritatively — use it for "what's at stake" UI only.
 */
export function previewSpChange(opts: {
  sp: number;
  outcome: GameOutcome;
  opponentSp?: number;
  penalty?: PenaltyKind | null;
}): { base: number; bonus: number; penalty: number; total: number } {
  const tier = tierOf(opts.sp);
  const base = tier.rates[opts.outcome];
  const bonus =
    opts.outcome === "win" && opts.opponentSp !== undefined
      ? upsetBonusFor(tier, tierOf(opts.opponentSp))
      : 0;
  const penalty = opts.penalty ? PENALTIES[opts.penalty] : 0;
  return { base, bonus, penalty, total: base + bonus + penalty };
}

// ── Season-end rewards ───────────────────────────────────────────────

/** Reward codes granted for finishing a season in each tier. */
export const TIER_REWARDS: Record<TierCode, string[]> = {
  bronze: ["badge_bronze"],
  silver: ["badge_silver", "coins"],
  gold: ["coins", "avatar_premium"],
  platinum: ["coins", "frame_platinum", "title_platinum"],
  diamond: ["badge_animated_diamond"],
  master: ["theme_master"],
  grandmaster: ["badge_crown", "border_grandmaster", "hall_of_fame", "trophy_season"],
};

export const REWARD_LABELS: Record<string, string> = {
  badge_bronze: "Bronze Badge",
  badge_silver: "Silver Badge",
  coins: "Season Coins",
  avatar_premium: "Premium Avatar",
  frame_platinum: "Platinum Profile Frame",
  title_platinum: "Platinum Title",
  badge_animated_diamond: "Animated Diamond Badge",
  theme_master: "Exclusive Master Theme",
  badge_crown: "Crown Badge",
  border_grandmaster: "Grandmaster Border",
  hall_of_fame: "Hall of Fame Entry",
  trophy_season: "Season Trophy",
  top_1: "Season Champion",
  top_3: "Podium Finish",
  top_10: "Top 10",
  top_100: "Top 100",
  // Legacy SECTION 77 codes still present in historical rows.
  season_champion: "Season Champion",
  champion_badge: "Champion Badge",
  podium_badge: "Podium Finish",
  most_improved: "Most Improved Player",
  puzzle_master: "Puzzle Master",
  highest_win_streak: "Highest Win Streak",
  best_new_player: "Best New Player",
  regional_champion: "Regional Champion",
};

export function rewardLabel(code: string): string {
  return REWARD_LABELS[code] ?? code.replace(/_/g, " ");
}
