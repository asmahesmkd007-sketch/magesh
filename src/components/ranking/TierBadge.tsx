// =====================================================================
// TierBadge — Compatibility wrapper around SeasonShield
// =====================================================================
import { SeasonShield, type ShieldSize } from "./SeasonShield";

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

export function TierBadge({ rungId, sp, size = "chip", tierOnly = false, className = "" }: Props) {
  const shieldSize: ShieldSize = size === "hero" ? "lg" : size === "md" ? "md" : "sm";
  const variant = size === "hero" ? "full" : "chip";

  return (
    <SeasonShield
      sp={sp}
      rungId={rungId}
      size={shieldSize}
      variant={variant}
      tierOnly={tierOnly}
      className={className}
    />
  );
}

export function TierLadderLegend({ activeCode }: { activeCode?: string | null }) {
  return (
    <div className="flex flex-wrap gap-2">
      {["bronze", "silver", "gold", "platinum", "diamond", "master", "grandmaster"].map((code) => (
        <SeasonShield
          key={code}
          sp={0}
          size="xs"
          variant="chip"
          tierOnly
          customLabel={code.charAt(0).toUpperCase() + code.slice(1)}
          className={activeCode === code ? "" : "opacity-60"}
        />
      ))}
    </div>
  );
}
