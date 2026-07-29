import { Radio, ShieldCheck } from "lucide-react";

import { behindLabel, formatDelay } from "@/lib/spectator/delay";

/**
 * The "LIVE · 25s delay" chip. Always visible on a spectator feed, never
 * dismissible: a viewer who does not know the feed is delayed reads slow
 * updates as a bug, and one who does not know *why* reads the delay as
 * one. The tooltip carries the reason.
 */
export function DelayBadge({
  delaySeconds,
  movesBehind,
  isPlayer,
  finished,
  className = "",
}: {
  delaySeconds: number;
  movesBehind: number;
  isPlayer: boolean;
  finished: boolean;
  className?: string;
}) {
  if (finished) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground ${className}`}
      >
        Final
      </span>
    );
  }

  if (isPlayer || delaySeconds <= 0) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-destructive ${className}`}
      >
        <Radio className="h-3 w-3 animate-pulse" aria-hidden />
        Live
      </span>
    );
  }

  const behind = behindLabel(movesBehind);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-gold ${className}`}
      title={
        `This broadcast runs ${formatDelay(delaySeconds)} behind the players to prevent ` +
        `engine assistance and ghost coaching.` +
        (behind ? ` You are ${behind}.` : "")
      }
    >
      <ShieldCheck className="h-3 w-3" aria-hidden />
      Live · {formatDelay(delaySeconds)} delay
    </span>
  );
}
