import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import {
  X,
  Swords,
  UserX,
  ExternalLink,
  Loader2,
  Trophy,
  Users,
  Gamepad2,
  MapPin,
} from "lucide-react";
import { GoldButton, GhostButton, Pill } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { ACHIEVEMENT_LABELS } from "@/lib/api/communityClient";
import { useFriendProfile } from "@/hooks/useFriendProfile";
import type { FriendRow } from "@/types/friend";
import type { TimeClass } from "@/lib/api/gameClient";

const TIME_CLASS_LABELS: Record<TimeClass, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  classical: "Classical",
  correspondence: "Correspondence",
};

function relTime(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function FriendProfileDrawer({
  friend,
  myUserId,
  onClose,
  onChallenge,
  onRemove,
}: {
  friend: FriendRow;
  myUserId: string;
  onClose: () => void;
  onChallenge: () => void;
  onRemove: (id: string) => void;
}) {
  const { data, loading } = useFriendProfile(myUserId, friend.other_id);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const name = friend.other_display ?? friend.other_username ?? "Unknown";

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${name}'s profile`}
        className="surface-card royal-scroll relative flex h-full w-full max-w-md flex-col overflow-y-auto rounded-l-[22px] border-l border-gold/20 p-6 animate-in slide-in-from-right duration-250"
      >
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close profile panel"
          className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-4 pr-8">
          <UserAvatar avatarUrl={friend.other_avatar_url} displayName={name} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {friend.other_title && (
                <span className="text-xs font-bold text-gold">{friend.other_title}</span>
              )}
              <span className="truncate font-display text-lg">{name}</span>
              <PremiumBadge
                premiumActive={friend.other_premium_active}
                premiumExpiresAt={friend.other_premium_expires_at}
              />
            </div>
            <div className="text-xs text-muted-foreground">@{friend.other_username}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Pill tone={friend.other_is_online ? "emerald" : "muted"}>
                {friend.other_activity === "playing"
                  ? "In a game"
                  : friend.other_is_online
                    ? "Online"
                    : "Offline"}
              </Pill>
              {friend.other_country && (
                <Pill tone="muted">
                  <MapPin className="h-3 w-3" /> {friend.other_country}
                </Pill>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          {friend.other_activity === "playing" && friend.other_active_game_id ? (
            <Link
              to="/game/$id"
              params={{ id: friend.other_active_game_id }}
              className="flex-1"
              aria-label="Watch this friend's live game"
            >
              <GhostButton className="w-full border-gold/40 text-gold">
                <Gamepad2 className="h-4 w-4" /> Watch Game
              </GhostButton>
            </Link>
          ) : (
            <GoldButton onClick={onChallenge} className="flex-1">
              <Swords className="h-4 w-4" /> Challenge
            </GoldButton>
          )}
          <Link to="/profile" search={{ id: friend.other_id }}>
            <GhostButton aria-label="View full profile">
              <ExternalLink className="h-4 w-4" />
            </GhostButton>
          </Link>
          <GhostButton onClick={() => onRemove(friend.id)} aria-label="Remove friend">
            <UserX className="h-4 w-4" />
          </GhostButton>
        </div>

        {loading ? (
          <div className="grid flex-1 place-items-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-gold" />
          </div>
        ) : (
          <div className="mt-8 space-y-7">
            <section>
              <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-gold/70">Ratings</h3>
              <div className="grid grid-cols-2 gap-2">
                {(["bullet", "blitz", "rapid", "classical"] as TimeClass[]).map((tc) => (
                  <div
                    key={tc}
                    className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center"
                  >
                    <div className="text-[11px] text-muted-foreground">{TIME_CLASS_LABELS[tc]}</div>
                    <div className="mt-0.5 font-stat text-lg text-gold">
                      {data?.ratings[tc]?.rating ?? 100}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {data?.ratings[tc]?.gamesPlayed ?? 0} games
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-3 flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-gold/70">
                <Gamepad2 className="h-3.5 w-3.5" /> Recent Games
              </h3>
              {!data || data.recentGames.length === 0 ? (
                <p className="text-sm text-muted-foreground">No finished games yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.recentGames.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2 text-sm"
                    >
                      <span className="truncate">vs {g.opponent_name}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        {g.time_control}
                        <span
                          className={
                            g.outcome === "win"
                              ? "text-emerald"
                              : g.outcome === "loss"
                                ? "text-destructive"
                                : "text-muted-foreground"
                          }
                        >
                          {g.outcome === "win" ? "Won" : g.outcome === "loss" ? "Lost" : "Draw"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-3 flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-gold/70">
                <Users className="h-3.5 w-3.5" /> Mutual Friends
              </h3>
              {!data || data.mutualFriends.length === 0 ? (
                <p className="text-sm text-muted-foreground">No mutual friends yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.mutualFriends.map((m) => (
                    <Link
                      key={m.id}
                      to="/profile"
                      search={{ id: m.id }}
                      className="royal-chip rounded-full border px-3 py-1 text-xs hover:text-gold"
                    >
                      {m.display ?? m.username}
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-3 flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-gold/70">
                <Trophy className="h-3.5 w-3.5" /> Achievements
              </h3>
              {!data || data.achievements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No achievements yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.achievements.map((a) => (
                    <span
                      key={a.code}
                      title={relTime(a.awarded_at)}
                      className="flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/[0.06] px-3 py-1 text-xs text-gold"
                    >
                      <Trophy className="h-3 w-3" />
                      {ACHIEVEMENT_LABELS[a.code] ?? a.code}
                    </span>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
