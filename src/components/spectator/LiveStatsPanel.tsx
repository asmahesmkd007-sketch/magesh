import { AlertTriangle, BookOpen, Clock, Scale } from "lucide-react";

import type { LiveStats } from "@/lib/spectator/stats";

/**
 * The statistics rail beside the board.
 *
 * Everything shown is derived from the delayed position and the released
 * move list, so nothing here can tell a viewer something the board does
 * not already show. Engine evaluation and per-move accuracy are
 * deliberately absent while a game is live — they are the post-game
 * review's job, and streaming them would rebuild the coaching channel
 * the broadcast delay exists to close.
 */
export function LiveStatsPanel({
  stats,
  opening,
  className = "",
}: {
  stats: LiveStats;
  opening: string | null;
  className?: string;
}) {
  const lead = stats.materialAdvantage;
  const leadLabel = lead === 0 ? "Level" : lead > 0 ? `White +${lead}` : `Black +${Math.abs(lead)}`;

  return (
    <div className={`space-y-3 ${className}`}>
      <Row
        icon={<Scale className="h-3.5 w-3.5" />}
        label="Material"
        value={leadLabel}
        tone={lead === 0 ? "muted" : "gold"}
      />

      <MaterialBar advantage={lead} />

      <Row
        icon={<Clock className="h-3.5 w-3.5" />}
        label="Avg. move time"
        value={
          <span className="tabular-nums">
            {formatSeconds(stats.avgMoveSeconds.white)}
            <span className="mx-1 text-muted-foreground">/</span>
            {formatSeconds(stats.avgMoveSeconds.black)}
          </span>
        }
      />

      <Row label="Move" value={<span className="tabular-nums">{stats.moveNumber}</span>} />

      <Row
        label="Pieces"
        value={
          <span className="tabular-nums">
            {pieceTotal(stats.white.counts)} v {pieceTotal(stats.black.counts)}
          </span>
        }
      />

      {opening && (
        <Row
          icon={<BookOpen className="h-3.5 w-3.5" />}
          label="Opening"
          value={<span className="text-right">{opening}</span>}
        />
      )}

      {stats.repetitionWarning && (
        <Warning>Position repeated {stats.repetitions} times — a draw can be claimed.</Warning>
      )}
      {stats.fiftyMoveWarning && (
        <Warning>
          {Math.floor(stats.halfmoveClock / 2)} moves without a capture or pawn move — the
          fifty-move rule is approaching.
        </Warning>
      )}
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: "default" | "gold" | "muted";
}) {
  const toneClass =
    tone === "gold" ? "text-gold" : tone === "muted" ? "text-muted-foreground" : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={`font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}

/**
 * A two-sided bar for the material lead. Capped at ±10 points: past that
 * the game is decided and extra travel conveys nothing.
 */
function MaterialBar({ advantage }: { advantage: number }) {
  const capped = Math.max(-10, Math.min(10, advantage));
  const whitePct = 50 + (capped / 10) * 50;
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-charcoal"
      role="img"
      aria-label={`Material balance: ${advantage === 0 ? "level" : advantage > 0 ? `White ahead by ${advantage}` : `Black ahead by ${-advantage}`}`}
    >
      <div
        className="h-full bg-ivory transition-[width] duration-500"
        style={{ width: `${whitePct}%` }}
      />
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-gold/25 bg-gold/[0.07] px-2.5 py-2 text-[11px] leading-relaxed text-gold">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

function pieceTotal(counts: LiveStats["white"]["counts"]): number {
  return counts.p + counts.n + counts.b + counts.r + counts.q;
}

function formatSeconds(s: number | null): string {
  if (s === null) return "—";
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}
