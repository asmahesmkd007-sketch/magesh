// =====================================================================
// Season tier ladder — COMPATIBILITY SHIM
// ---------------------------------------------------------------------
// The ladder now lives in src/lib/ranking/tiers.ts (Bronze → Grandmaster,
// three divisions each), mirroring public.sp_rung() in schema.sql
// SECTION 102. This module keeps the SECTION 77-era export surface
// (SEASON_TIERS / tierOf / nextTierOf / tierProgress / reward labels)
// so /seasons and anything else built against it keeps working — but it
// is now backed by the SAME ladder the /rankings page uses.
//
// Before this shim, the two pages rendered the same stored number with
// different vocabularies: 1,200 points read as "Expert" on /seasons and
// "Gold III" on /rankings. One ladder, one set of names.
//
// New code should import from "@/lib/ranking/tiers" directly.
// =====================================================================
import { LADDER, REWARD_LABELS, rungOf, rungProgress, type Rung } from "@/lib/ranking/tiers";

export type SeasonTier = {
  /** Full rung name, e.g. "Gold III". */
  name: string;
  min: number;
  /** Exclusive upper bound; null = uncapped top rung. */
  max: number | null;
  /** Tailwind text class for the tier's identity colour. */
  text: string;
  /** Tailwind background/border classes for badges. */
  badge: string;
  /** Progress-bar fill class. */
  bar: string;
};

function toSeasonTier(rung: Rung): SeasonTier {
  return {
    name: rung.label,
    min: rung.minSp,
    max: rung.nextSp,
    text: rung.tier.text,
    badge: rung.tier.badge,
    bar: rung.tier.bar,
  };
}

/** Every rung of the ladder, ascending. */
export const SEASON_TIERS: SeasonTier[] = LADDER.map(toSeasonTier);

export function tierOf(points: number): SeasonTier {
  return toSeasonTier(rungOf(points));
}

export function nextTierOf(points: number): SeasonTier | null {
  const cur = rungOf(points);
  const next = LADDER[cur.index + 1];
  return next ? toSeasonTier(next) : null;
}

/** 0–100 progress through the current rung toward the next one. */
export function tierProgress(points: number): number {
  return rungProgress(points);
}

/**
 * Display name for a tier value stored on a history row. Rows frozen
 * since SECTION 102 hold a tier CODE ("grandmaster"); older rows hold a
 * legacy display name ("Chessox Legend"). Anything unrecognised falls
 * back to resolving the points against the current ladder.
 */
export function tierDisplayName(stored: string | null | undefined, points: number): string {
  if (!stored) return tierOf(points).name;
  const code = stored.toLowerCase();
  const match = LADDER.find((r) => r.tier.code === code);
  if (match) return match.tier.name; // "grandmaster" → "Grandmaster"
  return stored; // legacy label, shown as recorded at the time
}

/** Human labels for reward/badge codes awarded at season end. */
export const SEASON_REWARD_LABELS: Record<string, string> = REWARD_LABELS;
