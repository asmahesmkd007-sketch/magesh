import { useEffect, useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";

interface Props {
  moveDeadlineAt: number | null;
  moveDeadlineSeconds: number | null;
  isActiveTurn: boolean;
  isGameActive: boolean;
  isAbortedDeadline?: boolean;
  className?: string;
}

export function MoveDeadlineIndicator({
  moveDeadlineAt,
  moveDeadlineSeconds,
  isActiveTurn,
  isGameActive,
  isAbortedDeadline,
  className = "",
}: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isGameActive || !moveDeadlineAt) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [isGameActive, moveDeadlineAt]);

  if (isAbortedDeadline) {
    const secStr = moveDeadlineSeconds ? `${moveDeadlineSeconds} seconds` : "deadline";
    return (
      <div
        className={`flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/40 px-2.5 py-1 text-xs text-red-300 font-semibold ${className}`}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-red-400 font-bold">
            GAME ABORTED
          </span>
          <span className="text-[11px] leading-tight font-mono">No move within {secStr}.</span>
        </div>
      </div>
    );
  }

  if (!isGameActive || !moveDeadlineAt || !moveDeadlineSeconds) return null;

  const leftMs = Math.max(0, moveDeadlineAt - now);
  const leftSec = Math.ceil(leftMs / 1000);
  const formatted =
    leftSec >= 60
      ? `${Math.floor(leftSec / 60)}:${String(leftSec % 60).padStart(2, "0")}`
      : `00:${String(leftSec).padStart(2, "0")}`;

  const isWarning = leftSec <= 10;

  if (isActiveTurn) {
    return (
      <div
        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1 transition-all ${
          isWarning
            ? "border-red-500/60 bg-red-500/15 text-red-300 shadow-sm shadow-red-500/20"
            : "border-amber-500/40 bg-amber-500/10 text-amber-300"
        } ${className}`}
      >
        <Clock
          className={`h-3.5 w-3.5 shrink-0 ${isWarning ? "text-red-400 animate-pulse" : "text-amber-400"}`}
        />
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-widest font-bold text-amber-400">
            MOVE NOW
          </span>
          <span className="font-mono text-xs font-bold tabular-nums leading-tight">{formatted}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-muted-foreground ${className}`}
    >
      <Clock className="h-3 w-3 shrink-0 text-muted-foreground/70" />
      <div className="flex flex-col">
        <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground/80">
          WAITING
        </span>
        <span className="text-[11px] leading-tight font-mono">Opponent has {leftSec}s</span>
      </div>
    </div>
  );
}
