import { useState } from "react";
import { UserPlus, Clock, Check, UserCheck, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useFriendGraph } from "@/hooks/useFriendGraph";

/**
 * Drop-in "Add Friend" control for any spot that shows another player —
 * leaderboard rows, chat headers, clan member lists, community posts, game
 * pages, game history, profile match rows. Fully self-contained: reads the
 * logged-in user via useAuth() and the shared friend-relationship cache via
 * useFriendGraph(), so callers only ever need `<FriendButton targetUserId={id} />`.
 *
 * Renders nothing if there's no logged-in user, no target, or the target IS
 * the logged-in user — every call site can pass a raw id without its own
 * guard.
 */
export function FriendButton({
  targetUserId,
  targetName,
  compact = true,
  className = "",
}: {
  targetUserId?: string | null;
  targetName?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const { user } = useAuth();
  const graph = useFriendGraph(user?.id);
  const [busy, setBusy] = useState(false);

  if (!user || !targetUserId || targetUserId === user.id) return null;

  if (graph.loading) {
    return (
      <span
        aria-hidden="true"
        className={`inline-block h-6 w-6 shrink-0 animate-pulse rounded-full bg-white/5 ${className}`}
      />
    );
  }

  const relation = graph.getRelation(targetUserId);

  async function run(action: () => Promise<void>, successMessage?: string) {
    setBusy(true);
    try {
      await action();
      if (successMessage) toast.success(successMessage);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const base =
    "inline-flex shrink-0 items-center gap-1.5 rounded-full text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-60";
  const sizing = compact ? "h-7 w-7 justify-center" : "px-3 py-1.5";

  if (relation.status === "blocked") {
    return (
      <span
        title="Blocked"
        className={`${base} ${sizing} bg-white/5 text-muted-foreground/50 ${className}`}
      >
        <Ban className="h-3.5 w-3.5" />
        {!compact && "Blocked"}
      </span>
    );
  }

  if (relation.status === "friends") {
    return (
      <span title="Friends" className={`${base} ${sizing} bg-emerald/10 text-emerald ${className}`}>
        <UserCheck className="h-3.5 w-3.5" />
        {!compact && "Friends ✓"}
      </span>
    );
  }

  if (relation.status === "incoming") {
    return (
      <button
        type="button"
        disabled={busy}
        title="Accept friend request"
        aria-label={`Accept friend request from ${targetName ?? "this player"}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!relation.rowId) return;
          run(() => graph.acceptRequest(relation.rowId!), "You are now friends!");
        }}
        className={`${base} ${sizing} bg-gold/15 text-gold hover:bg-gold/25 ${className}`}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
        {!compact && "Accept Friend"}
      </button>
    );
  }

  if (relation.status === "outgoing") {
    return (
      <button
        type="button"
        disabled={busy}
        title="Cancel friend request"
        aria-label={`Cancel friend request to ${targetName ?? "this player"}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!relation.rowId) return;
          run(() => graph.cancelOrReject(relation.rowId!), "Friend request cancelled");
        }}
        className={`${base} ${sizing} bg-white/5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive ${className}`}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Clock className="h-3.5 w-3.5" />
        )}
        {!compact && "Requested"}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      title="Add friend"
      aria-label={`Add ${targetName ?? "this player"} as a friend`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        run(() => graph.sendRequest(targetUserId), "Friend request sent!");
      }}
      className={`${base} ${sizing} bg-white/5 text-muted-foreground hover:bg-gold/20 hover:text-gold ${className}`}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <UserPlus className="h-3.5 w-3.5" />
      )}
      {!compact && "Add Friend"}
    </button>
  );
}
