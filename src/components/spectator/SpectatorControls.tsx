import {
  ChevronLeft,
  ChevronRight,
  FlipVertical2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";

import type { SpectatorControls as Controls } from "@/hooks/useSpectatorGame";

/**
 * Replay transport for a spectator feed.
 *
 * "Pause" here means pause *the viewer*, not the game — the players keep
 * playing and the server keeps releasing plies. Pausing simply pins the
 * board to the current ply; Resume jumps back to the live tip rather
 * than replaying the backlog, which is what a viewer who has been
 * reading a position actually wants when they look up.
 */
export function SpectatorControls({
  controls,
  available,
  ply,
  flipped,
  onFlip,
  fullscreen,
  onToggleFullscreen,
  finished,
}: {
  controls: Controls;
  available: number;
  ply: number;
  flipped: boolean;
  onFlip: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  finished: boolean;
}) {
  const atStart = ply <= 0;
  const atEnd = ply >= available;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl border border-gold/20 bg-white/[0.03] p-1">
        <IconButton label="First move" onClick={controls.first} disabled={atStart}>
          <SkipBack className="h-4 w-4" />
        </IconButton>
        <IconButton label="Previous move" onClick={controls.previous} disabled={atStart}>
          <ChevronLeft className="h-4 w-4" />
        </IconButton>

        {!finished && (
          <IconButton
            label={controls.paused ? "Resume live" : "Pause"}
            onClick={controls.paused ? controls.toLive : controls.pause}
            highlight={controls.paused}
          >
            {controls.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </IconButton>
        )}

        <IconButton label="Next move" onClick={controls.next} disabled={atEnd}>
          <ChevronRight className="h-4 w-4" />
        </IconButton>
        <IconButton
          label={finished ? "Last move" : "Jump to live"}
          onClick={controls.last}
          disabled={atEnd}
        >
          <SkipForward className="h-4 w-4" />
        </IconButton>
      </div>

      <IconButton label="Flip board" onClick={onFlip} bordered highlight={flipped}>
        <FlipVertical2 className="h-4 w-4" />
      </IconButton>

      <IconButton
        label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        onClick={onToggleFullscreen}
        bordered
        highlight={fullscreen}
      >
        {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </IconButton>

      {controls.paused && !finished && (
        <button
          type="button"
          onClick={controls.toLive}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-destructive transition-colors hover:bg-destructive/20"
        >
          <Play className="h-3 w-3" aria-hidden />
          Back to live
        </button>
      )}
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
  highlight,
  bordered,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
  bordered?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        bordered ? "border border-gold/20 bg-white/[0.03]" : ""
      } ${highlight ? "text-gold" : "text-foreground hover:text-gold"} ${
        disabled ? "" : "hover:bg-white/[0.06]"
      }`}
    >
      {children}
    </button>
  );
}
