// =====================================================================
// Small shared pieces for the tournament (TR) page: countdowns that
// trust the server clock, animated coin counters, a FEN mini-board,
// avatars, and formatting helpers. Everything here is presentation-only.
// =====================================================================
import { memo, useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { PieceGlyph } from "@/lib/chess/pieceThemes";
import type { PieceSymbol } from "chess.js";
import type { TournamentConnection } from "@/hooks/useTournament";

// ---------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------
export function fmtClock(ms: number | null | undefined): string {
  const t = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "—";
  const secs = Math.max(
    0,
    Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000),
  );
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export function fmtTimeAgo(iso: string, nowMs = Date.now()): string {
  const secs = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const END_REASON_LABEL: Record<string, string> = {
  checkmate: "Checkmate",
  timeout: "Timeout",
  resign: "Resignation",
  resignation: "Resignation",
  no_show: "No-show",
  stalemate: "Stalemate",
  repetition: "Repetition",
  insufficient: "Insufficient material",
  "fifty-move": "Fifty-move rule",
  agreement: "Draw agreed",
  tournament_cancelled: "Cancelled",
};

// ---------------------------------------------------------------------
// Server-synced countdown
// ---------------------------------------------------------------------
export function Countdown({
  target,
  offsetMs,
  onZero,
  className = "",
}: {
  target: string | null;
  /** server_now - Date.now() at load; keeps the timer honest. */
  offsetMs: number;
  onZero?: () => void;
  className?: string;
}) {
  const [remain, setRemain] = useState<number | null>(null);
  const firedRef = useRef(false);
  const onZeroRef = useRef(onZero);
  onZeroRef.current = onZero;

  useEffect(() => {
    firedRef.current = false;
    if (!target) {
      setRemain(null);
      return;
    }
    const targetMs = new Date(target).getTime();
    const tick = () => {
      const left = targetMs - (Date.now() + offsetMs);
      setRemain(left);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        onZeroRef.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, offsetMs]);

  if (remain == null) return null;
  if (remain <= 0)
    return <span className={`text-emerald animate-pulse ${className}`}>Starting…</span>;

  const t = Math.floor(remain / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const seg = (v: number, label: string) => (
    <span className="inline-flex items-baseline gap-0.5">
      <span className="font-stat tabular-nums">{String(v).padStart(2, "0")}</span>
      <span className="text-[0.65em] opacity-60">{label}</span>
    </span>
  );
  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
      {h > 0 && seg(h, "h")}
      {seg(m, "m")}
      {seg(s, "s")}
    </span>
  );
}

// ---------------------------------------------------------------------
// Animated coin count — eases toward its target so joins/prizes visibly
// "count up/down" instead of snapping.
// ---------------------------------------------------------------------
export function AnimatedCoins({ value, className = "" }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={`tabular-nums ${className}`}>{display.toLocaleString("en-IN")}</span>;
}

// ---------------------------------------------------------------------
// FEN mini-board preview (read-only)
// ---------------------------------------------------------------------
export const MiniBoard = memo(function MiniBoard({
  fen,
  className = "",
}: {
  fen: string | null;
  className?: string;
}) {
  const board = (fen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").split(" ")[0];
  const rows = board.split("/");
  const cells: ({ color: "w" | "b"; type: PieceSymbol } | null)[][] = rows.map((row) => {
    const out: ({ color: "w" | "b"; type: PieceSymbol } | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) out.push(null);
      } else {
        out.push({
          color: ch === ch.toUpperCase() ? "w" : "b",
          type: ch.toLowerCase() as PieceSymbol,
        });
      }
    }
    return out;
  });

  return (
    <div
      className={`grid aspect-square w-full grid-cols-8 overflow-hidden rounded-lg border border-white/10 ${className}`}
    >
      {cells.flatMap((row, r) =>
        row.map((cell, c) => (
          <div
            key={`${r}-${c}`}
            className={`relative ${(r + c) % 2 === 0 ? "bg-gold/20" : "bg-black/40"}`}
          >
            {cell && (
              <div className="absolute inset-[6%]">
                <PieceGlyph theme="classic" color={cell.color} type={cell.type} />
              </div>
            )}
          </div>
        )),
      )}
    </div>
  );
});

// ---------------------------------------------------------------------
// Avatar with initial fallback
// ---------------------------------------------------------------------
export function PlayerAvatar({
  username,
  avatarUrl,
  size = "h-9 w-9",
  ring = "",
}: {
  username: string | null;
  avatarUrl?: string | null;
  size?: string;
  ring?: string;
}) {
  const name = username || "Player";
  return avatarUrl ? (
    <img
      src={avatarUrl}
      alt={name}
      className={`${size} shrink-0 rounded-full object-cover ${ring}`}
      loading="lazy"
    />
  ) : (
    <div
      className={`${size} grid shrink-0 place-items-center rounded-full bg-gold/10 font-display text-sm text-gold ${ring}`}
    >
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

// ---------------------------------------------------------------------
// Connection status pill
// ---------------------------------------------------------------------
export function ConnectionBadge({ connection }: { connection: TournamentConnection }) {
  if (connection === "live")
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-emerald/30 bg-emerald/10 px-2.5 py-1 text-[11px] text-emerald">
        <Wifi className="h-3 w-3" /> Live sync
      </span>
    );
  if (connection === "offline")
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-400">
        <WifiOff className="h-3 w-3" /> Offline
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-400">
      <Loader2 className="h-3 w-3 animate-spin" />
      {connection === "connecting" ? "Connecting" : "Reconnecting"}
    </span>
  );
}

// ---------------------------------------------------------------------
// Tournament status badge
// ---------------------------------------------------------------------
export function StatusBadge({ status }: { status: string }) {
  if (status === "live")
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-emerald/15 px-3 py-1 text-xs text-emerald">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" /> Live
      </span>
    );
  if (status === "upcoming")
    return (
      <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs text-gold">
        Upcoming
      </span>
    );
  if (status === "locked")
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" /> Starting Soon
      </span>
    );
  if (status === "cancelled")
    return (
      <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-400">
        Cancelled
      </span>
    );
  return (
    <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-muted-foreground">
      Completed
    </span>
  );
}
