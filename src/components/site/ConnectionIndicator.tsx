// =====================================================================
// CONNECTION INDICATOR — a dot, and a way back when the dot goes out
// ---------------------------------------------------------------------
// Reads `ConnectionState` straight from `useLiveGame`; it holds no state
// of its own and starts no timers, so it cannot disagree with the
// transport. Sized to sit in an existing header row — it never covers
// the board.
// =====================================================================
import type { ConnectionState } from "@/realtime/client/useLiveGame";

const DOT: Record<ConnectionState, string> = {
  connecting: "bg-amber-400 animate-pulse",
  live: "bg-emerald-400",
  reconnecting: "bg-amber-400 animate-pulse",
  offline: "bg-rose-500",
};

const LABEL: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  live: "Connected",
  reconnecting: "Reconnecting…",
  offline: "Connection lost",
};

export function ConnectionIndicator({
  connection,
  onRejoin,
  className = "",
  compact = false,
}: {
  connection: ConnectionState;
  /** Authoritative rejoin of the same game — see `useLiveGame.rejoin`. */
  onRejoin: () => void;
  className?: string;
  /**
   * Dot only, for a cramped header. The state is still announced — the
   * label moves to `aria-label` rather than disappearing.
   */
  compact?: boolean;
}) {
  const lost = connection === "offline";

  if (compact) {
    return (
      <span
        role="status"
        aria-live="polite"
        aria-label={LABEL[connection]}
        title={LABEL[connection]}
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${DOT[connection]} ${className}`}
      />
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
        lost ? "text-rose-300" : connection === "live" ? "text-muted-foreground" : "text-amber-300"
      } ${className}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[connection]}`} aria-hidden />
      <span className="whitespace-nowrap">{LABEL[connection]}</span>
      {lost && (
        <button
          type="button"
          onClick={onRejoin}
          className="ml-1 shrink-0 rounded-md border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] font-semibold text-gold transition-colors hover:bg-gold/20"
        >
          Rejoin Game
        </button>
      )}
    </div>
  );
}
