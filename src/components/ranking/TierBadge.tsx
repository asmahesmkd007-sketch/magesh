// =====================================================================
// TierBadge — the Season Points rank emblem
// ---------------------------------------------------------------------
// Three sizes: `chip` for leaderboard rows, `md` for cards, `hero` for
// the profile header (with the animated ring the top tiers earn). The
// tier's identity colour and glow come from lib/ranking/tiers.ts, so the
// badge stays in sync with the ladder definition.
// =====================================================================
import { rungById, tierOf, type Rung, type TierCode } from "@/lib/ranking/tiers";
import { TIER_BY_CODE } from "@/lib/ranking/tiers";

type Size = "chip" | "md" | "hero";

type Props = {
  /** Preferred: the exact rung ("gold_2"). */
  rungId?: string | null;
  /** Fallback when only a total is known. */
  sp?: number;
  size?: Size;
  /** Hide the division numeral (tier name only). */
  tierOnly?: boolean;
  className?: string;
};

const ROMAN: Record<number, string> = { 1: "I", 2: "II", 3: "III" };

/** Simple chess-crown mark; fills with the tier colour via currentColor. */
function TierMark({ tier, className }: { tier: TierCode; className?: string }) {
  // Crowns gain points as the tier rises — a small visual progression.
  const points = tier === "bronze" ? 3 : tier === "silver" ? 3 : tier === "gold" ? 5 : 5;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      {points === 3 ? (
        <path
          d="M4 17h16l-1.5-8-4 3.5L12 6l-2.5 6.5-4-3.5L4 17Z"
          fill="currentColor"
          fillOpacity={0.9}
        />
      ) : (
        <path d="M3 17h18l-1-9-4 3-3-5-3 5-4-3-1 9Z" fill="currentColor" fillOpacity={0.9} />
      )}
      <rect x="4" y="18" width="16" height="2.4" rx="1.2" fill="currentColor" />
    </svg>
  );
}

export function TierBadge({ rungId, sp, size = "chip", tierOnly = false, className = "" }: Props) {
  const rung: Rung | null = rungById(rungId) ?? null;
  const tier = rung ? rung.tier : tierOf(sp ?? 0);
  const division = rung?.division ?? null;
  const label = tierOnly || division === null ? tier.name : `${tier.name} ${ROMAN[division]}`;

  if (size === "chip") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tier.badge} ${tier.text} ${className}`}
        title={label}
      >
        <TierMark tier={tier.code} className="h-3 w-3" />
        {label}
      </span>
    );
  }

  if (size === "md") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm font-semibold ${tier.badge} ${tier.text} ${className}`}
      >
        <TierMark tier={tier.code} className="h-4 w-4" />
        {label}
      </span>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div
        className={`grid h-20 w-20 place-items-center rounded-2xl border-2 ${tier.badge} ${tier.text} ${tier.glow}`}
      >
        <TierMark tier={tier.code} className="h-10 w-10" />
      </div>
      <div className={`font-display text-lg ${tier.text}`}>{label}</div>
    </div>
  );
}

/** Small legend of the whole ladder — used on the seasons page. */
export function TierLadderLegend({ activeCode }: { activeCode?: string | null }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.values(TIER_BY_CODE).map((t) => (
        <span
          key={t.code}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
            activeCode === t.code ? `${t.badge} ${t.text}` : "border-white/10 text-muted-foreground"
          }`}
        >
          <TierMark tier={t.code} className="h-2.5 w-2.5" />
          {t.name}
        </span>
      ))}
    </div>
  );
}
