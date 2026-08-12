import { usePresence } from "@/hooks/usePresence";

interface PresenceDotProps {
  userId?: string | null;
  status?: "online" | "offline";
  className?: string;
  showText?: boolean;
  textClassName?: string;
}

/**
 * Real-time visual presence dot (Green for Online, Gray for Offline).
 * Automatically updates live without page refresh.
 */
export function PresenceDot({
  userId,
  status: propStatus,
  className = "h-2.5 w-2.5",
  showText = false,
  textClassName = "",
}: PresenceDotProps) {
  const { status: liveStatus } = usePresence(propStatus ? undefined : userId);
  const status = propStatus ?? liveStatus;
  const isOnline = status === "online";

  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <span
        className={`inline-block rounded-full ring-2 ring-background transition-all duration-300 ${className} ${
          isOnline
            ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse"
            : "bg-zinc-500/80"
        }`}
        title={isOnline ? "Online" : "Offline"}
      />
      {showText && (
        <span
          className={`text-xs font-semibold capitalize tracking-wide transition-colors ${
            isOnline ? "text-emerald-400 font-bold" : "text-muted-foreground/80"
          } ${textClassName}`}
        >
          {isOnline ? "Online" : "Offline"}
        </span>
      )}
    </span>
  );
}

/**
 * Standardized presence badge with dot and "Online" / "Offline" label.
 */
export function UserPresenceBadge({
  userId,
  className = "",
}: {
  userId?: string | null;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <PresenceDot userId={userId} showText />
    </div>
  );
}
