// =====================================================================
// Season IQ tier ladder — mirrors public.season_tier() in schema.sql
// SECTION 77 (the server is the sole authority; this is display only).
// =====================================================================

export type SeasonTier = {
  name: string;
  min: number;
  /** Exclusive upper bound; null = uncapped top tier. */
  max: number | null;
  /** Tailwind text class for the tier's identity color. */
  text: string;
  /** Tailwind background/border classes for badges. */
  badge: string;
  /** Progress-bar fill class. */
  bar: string;
};

export const SEASON_TIERS: SeasonTier[] = [
  {
    name: "Beginner",
    min: 0,
    max: 200,
    text: "text-zinc-400",
    badge: "border-zinc-500/30 bg-zinc-500/10",
    bar: "bg-zinc-400",
  },
  {
    name: "Learner",
    min: 200,
    max: 500,
    text: "text-stone-300",
    badge: "border-stone-400/30 bg-stone-400/10",
    bar: "bg-stone-300",
  },
  {
    name: "Skilled",
    min: 500,
    max: 1000,
    text: "text-emerald",
    badge: "border-emerald/30 bg-emerald/10",
    bar: "bg-emerald",
  },
  {
    name: "Expert",
    min: 1000,
    max: 2000,
    text: "text-sky-400",
    badge: "border-sky-500/30 bg-sky-500/10",
    bar: "bg-sky-400",
  },
  {
    name: "Master",
    min: 2000,
    max: 3500,
    text: "text-violet-400",
    badge: "border-violet-500/30 bg-violet-500/10",
    bar: "bg-violet-400",
  },
  {
    name: "Grandmaster",
    min: 3500,
    max: 5500,
    text: "text-rose-400",
    badge: "border-rose-500/30 bg-rose-500/10",
    bar: "bg-rose-400",
  },
  {
    name: "Elite",
    min: 5500,
    max: 8000,
    text: "text-amber-400",
    badge: "border-amber-500/30 bg-amber-500/10",
    bar: "bg-amber-400",
  },
  {
    name: "Chessox Legend",
    min: 8000,
    max: null,
    text: "text-gold",
    badge: "border-gold/40 bg-gold/10",
    bar: "gradient-gold",
  },
];

export function tierOf(iq: number): SeasonTier {
  for (let i = SEASON_TIERS.length - 1; i >= 0; i--) {
    if (iq >= SEASON_TIERS[i].min) return SEASON_TIERS[i];
  }
  return SEASON_TIERS[0];
}

export function nextTierOf(iq: number): SeasonTier | null {
  const idx = SEASON_TIERS.indexOf(tierOf(iq));
  return idx < SEASON_TIERS.length - 1 ? SEASON_TIERS[idx + 1] : null;
}

/** 0–100 progress through the current tier toward the next one. */
export function tierProgress(iq: number): number {
  const tier = tierOf(iq);
  if (tier.max === null) return 100;
  return Math.max(0, Math.min(100, Math.round(((iq - tier.min) / (tier.max - tier.min)) * 100)));
}

/** Human labels for reward/badge codes awarded at season end. */
export const SEASON_REWARD_LABELS: Record<string, string> = {
  season_champion: "Season Champion",
  champion_badge: "Champion Badge",
  top_1: "Rank #1",
  podium_badge: "Podium Finish",
  top_3: "Top 3",
  top_10: "Top 10",
  top_100: "Top 100",
  most_improved: "Most Improved Player",
  puzzle_master: "Puzzle Master",
  highest_win_streak: "Highest Win Streak",
  best_new_player: "Best New Player",
  regional_champion: "Regional Champion",
};
