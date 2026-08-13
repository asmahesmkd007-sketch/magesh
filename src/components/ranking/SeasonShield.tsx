import { useState, useEffect } from "react";
import {
  rungOf,
  rungById,
  rungProgress,
  nextRung,
  spToNextRung,
  type Rung,
  type TierCode,
} from "@/lib/ranking/tiers";

export const SHIELD_IMAGES: Record<string, string> = {
  bronze: "/chess_shield/bronze.webp",
  silver: "/chess_shield/silver.webp",
  gold: "/chess_shield/gold.webp",
  platinum: "/chess_shield/platinum.webp",
  diamond: "/chess_shield/diamond.webp",
  master: "/chess_shield/kingdom.webp",
  grandmaster: "/chess_shield/grandmaster.webp",
};

/** Get the correct shield image path for a rank family code. */
export function shieldImageForTier(tierCode: string | null | undefined): string {
  const code = (tierCode || "bronze").toLowerCase();
  if (SHIELD_IMAGES[code]) return SHIELD_IMAGES[code];
  if (
    code.includes("legend") ||
    code.includes("mythic") ||
    code.includes("immortal") ||
    code.includes("kingdom")
  ) {
    return SHIELD_IMAGES.master;
  }
  return SHIELD_IMAGES.bronze;
}

export type ShieldSize = "xs" | "sm" | "md" | "lg" | "xl";

export type SeasonShieldProps = {
  /** Season Points (SP) or raw rating. */
  sp?: number | null;
  /** Rating fallback if sp is not directly supplied. */
  rating?: number | null;
  /** Rung ID (e.g. "gold_2"); takes precedence over sp when present. */
  rungId?: string | null;
  /** Size preset. Defaults to "sm". */
  size?: ShieldSize;
  /** Visual layout mode:
   * - "icon": Shield image only
   * - "chip": Inline badge with small shield + rank text
   * - "card": Stacked shield + rank name + SP
   * - "full": Large shield + rank + SP + progress bar to next tier
   * - "inline": Horizontal row with shield + rank text + SP
   */
  variant?: "icon" | "chip" | "card" | "full" | "inline";
  /** Hide division numeral (tier name only, e.g. "Gold"). */
  tierOnly?: boolean;
  /** Custom text to display instead of rank label. */
  customLabel?: string;
  /** Custom CSS classes for container. */
  className?: string;
  /** Custom CSS classes for shield image. */
  imgClassName?: string;
  /** Hide numeric SP display even if variant would show it. */
  hideSp?: boolean;
  /**
   * Force eager loading for a shield known to be above the fold. The "full"
   * variant (the profile hero badge) is eager already; everything else is
   * lazy because it appears in lists, chips and cards further down.
   */
  priority?: boolean;
};

/**
 * Intrinsic pixel size of the source files. Given to every <img> as
 * width/height so the browser can reserve a correctly-proportioned box
 * before the bytes arrive — without it each shield popped in and shifted
 * the layout around it. The rendered size still comes from the CSS classes
 * in SIZE_CLASSES; these attributes only establish the 1:1 aspect ratio.
 */
const SHIELD_INTRINSIC_PX = 384;

const SIZE_CLASSES: Record<ShieldSize, { img: string; text: string; sub: string }> = {
  xs: { img: "h-4 w-4", text: "text-[10px]", sub: "text-[9px]" },
  sm: { img: "h-6 w-6", text: "text-xs font-semibold", sub: "text-[10px]" },
  md: { img: "h-10 w-10", text: "text-sm font-bold", sub: "text-xs" },
  lg: {
    img: "h-16 w-16 md:h-20 md:w-20",
    text: "text-base md:text-lg font-bold",
    sub: "text-xs md:text-sm",
  },
  xl: { img: "h-24 w-24 md:h-28 md:w-28", text: "text-xl md:text-2xl font-bold", sub: "text-sm" },
};

// A module-level dev check used to preload all seven shields to verify the
// asset paths resolve. It has been removed: it downloaded every shield on
// every dev page load, including the six the page never shows, and the
// per-image onError handlers below already report a broken path — but only
// for shields actually rendered, which is the case worth knowing about.

export function SeasonShield({
  sp,
  rating,
  rungId,
  size = "sm",
  variant = "chip",
  tierOnly = false,
  customLabel,
  className = "",
  imgClassName = "",
  hideSp = false,
  priority,
}: SeasonShieldProps) {
  const points = sp ?? rating ?? 0;
  const rung: Rung = rungById(rungId) ?? rungOf(points);
  const tier = rung.tier;
  const shieldSrc = shieldImageForTier(tier.code);

  const [imgFailed, setImgFailed] = useState(false);

  const label = customLabel ?? (tierOnly ? tier.name : rung.label);
  const sizeCfg = SIZE_CLASSES[size];

  // Loading is decided by WHERE the shield sits, not which tier it is. The
  // previous rule loaded bronze/silver/gold/platinum eagerly — precisely the
  // tiers most players hold — so a leaderboard eagerly fetched a shield for
  // every row. Only the "full" variant (the profile hero badge) is reliably
  // above the fold; callers can override either way with `priority`.
  const loadingStrategy = (priority ?? variant === "full") ? "eager" : "lazy";

  // 1. Icon variant — shield image only
  if (variant === "icon") {
    if (imgFailed) return null;
    return (
      <img
        src={shieldSrc}
        width={SHIELD_INTRINSIC_PX}
        height={SHIELD_INTRINSIC_PX}
        alt={`${label} Shield`}
        loading={loadingStrategy}
        onError={() => {
          console.warn(`[SeasonShield] Image failed to load: ${shieldSrc}`);
          setImgFailed(true);
        }}
        className={`object-contain select-none shrink-0 ${sizeCfg.img} ${imgClassName}`}
      />
    );
  }

  // 2. Chip variant — compact inline badge
  if (variant === "chip") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${tier.badge} ${tier.text} ${className}`}
        title={`${label} · ${points.toLocaleString()} SP`}
      >
        {!imgFailed && (
          <img
            src={shieldSrc}
            width={SHIELD_INTRINSIC_PX}
            height={SHIELD_INTRINSIC_PX}
            alt=""
            loading={loadingStrategy}
            onError={() => setImgFailed(true)}
            className={`object-contain select-none shrink-0 ${sizeCfg.img} ${imgClassName}`}
          />
        )}
        <span className={sizeCfg.text}>{label}</span>
      </span>
    );
  }

  // 3. Inline variant — shield + label + SP side-by-side
  if (variant === "inline") {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        {!imgFailed && (
          <img
            src={shieldSrc}
            width={SHIELD_INTRINSIC_PX}
            height={SHIELD_INTRINSIC_PX}
            alt={`${label} Shield`}
            loading={loadingStrategy}
            onError={() => setImgFailed(true)}
            className={`object-contain select-none shrink-0 ${sizeCfg.img} ${imgClassName}`}
          />
        )}
        <div className="flex flex-col min-w-0">
          <span className={`truncate ${sizeCfg.text} ${tier.text}`}>{label}</span>
          {!hideSp && (
            <span className={`font-mono text-muted-foreground ${sizeCfg.sub}`}>
              {points.toLocaleString()} SP
            </span>
          )}
        </div>
      </div>
    );
  }

  // 4. Card variant — stacked shield + label + SP
  if (variant === "card") {
    return (
      <div className={`flex flex-col items-center gap-1.5 text-center ${className}`}>
        {!imgFailed && (
          <div className="relative group">
            <div className={`absolute inset-0 rounded-full blur-md opacity-30 ${tier.glow}`} />
            <img
              src={shieldSrc}
              width={SHIELD_INTRINSIC_PX}
              height={SHIELD_INTRINSIC_PX}
              alt={`${label} Shield`}
              loading={loadingStrategy}
              onError={() => setImgFailed(true)}
              className={`relative object-contain select-none ${sizeCfg.img} ${imgClassName}`}
            />
          </div>
        )}
        <div className={`font-display ${sizeCfg.text} ${tier.text}`}>{label}</div>
        {!hideSp && (
          <div className={`font-mono text-muted-foreground ${sizeCfg.sub}`}>
            {points.toLocaleString()} SP
          </div>
        )}
      </div>
    );
  }

  // 5. Full variant — profile hero badge with progress bar
  const progress = rungProgress(points);
  const next = nextRung(points);
  const spNeeded = spToNextRung(points);

  return (
    <div className={`flex flex-col items-center gap-3 text-center ${className}`}>
      {!imgFailed && (
        <div className="relative">
          <div className={`absolute inset-0 rounded-full blur-xl opacity-40 ${tier.glow}`} />
          <img
            src={shieldSrc}
            width={SHIELD_INTRINSIC_PX}
            height={SHIELD_INTRINSIC_PX}
            alt={`${label} Shield`}
            loading={loadingStrategy}
            onError={() => setImgFailed(true)}
            className={`relative object-contain select-none transition-transform hover:scale-105 ${sizeCfg.img} ${imgClassName}`}
          />
        </div>
      )}

      <div>
        <div className={`font-display tracking-wide ${sizeCfg.text} ${tier.text}`}>{label}</div>
        {!hideSp && (
          <div className="mt-0.5 font-mono text-sm font-semibold text-gold/90">
            {points.toLocaleString()} SP
          </div>
        )}
      </div>

      {/* Progress bar to next tier */}
      <div className="w-full max-w-xs space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
          <span>Progress</span>
          {next ? (
            <span>
              {spNeeded?.toLocaleString()} SP to {next.label}
            </span>
          ) : (
            <span className="text-gold font-bold">Apex Rung</span>
          )}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10 p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${tier.bar}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
