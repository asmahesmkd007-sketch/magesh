import { Eye } from "lucide-react";

/**
 * "👀 1,284 Watching". Counts ACCOUNTS, not sessions — extra tabs do not
 * inflate it and signed-out viewers are not counted, so the number is
 * conservative on purpose. See spectator_heartbeat() in schema.sql.
 */
export function ViewerCount({
  count,
  className = "",
  compact = false,
}: {
  count: number;
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}
      title={`${count.toLocaleString()} signed-in ${count === 1 ? "spectator" : "spectators"}`}
    >
      <Eye className="h-3.5 w-3.5 text-gold/70" aria-hidden />
      <span className="font-stat tabular-nums text-foreground">{count.toLocaleString()}</span>
      {!compact && <span>watching</span>}
    </span>
  );
}
