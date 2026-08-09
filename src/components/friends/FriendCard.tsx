import { Link } from "@tanstack/react-router";
import {
  Swords,
  UserX,
  MessageCircle,
  MapPin,
  Clock,
  Eye,
  Gamepad2,
  Pin,
  Star,
} from "lucide-react";
import { Card, GoldButton, GhostButton, Pill } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { SeasonShield } from "@/components/ranking/SeasonShield";
import type { FriendRow } from "@/types/friend";

function relTime(iso?: string | null) {
  if (!iso) return "a while ago";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function friendsSince(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function statusMeta(activity?: FriendRow["other_activity"]) {
  switch (activity) {
    case "playing":
      return { label: "In a game", tone: "gold" as const, icon: Gamepad2 };
    case "online":
      return { label: "Online", tone: "emerald" as const, icon: null };
    default:
      return { label: "Offline", tone: "muted" as const, icon: null };
  }
}

export function FriendCard({
  friend,
  onRemove,
  onOpenChallenge,
  onOpenProfile,
  onTogglePin,
  onToggleFavorite,
  style,
}: {
  friend: FriendRow;
  onRemove: (id: string) => void;
  onOpenChallenge: (friend: FriendRow) => void;
  onOpenProfile: (friend: FriendRow) => void;
  onTogglePin: (friendUserId: string) => void;
  onToggleFavorite: (friendUserId: string) => void;
  style?: React.CSSProperties;
}) {
  const name = friend.other_display ?? friend.other_username ?? "Unknown";
  const status = statusMeta(friend.other_activity);

  return (
    <Card
      style={style}
      className="animate-rise-in group flex flex-col gap-4 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-gold/25 hover:shadow-gold-glow"
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onOpenProfile(friend)}
          className="relative shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          aria-label={`Open ${name}'s profile panel`}
        >
          <div className={`rounded-full ${friend.other_is_online ? "online-ring" : ""}`}>
            <UserAvatar avatarUrl={friend.other_avatar_url} displayName={name} size="md" />
          </div>
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background ${
              friend.other_activity === "playing"
                ? "bg-gold"
                : friend.other_is_online
                  ? "bg-emerald"
                  : "bg-white/20"
            }`}
            title={status.label}
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-sm font-medium">
            {friend.other_title && (
              <span className="text-xs font-bold text-gold">{friend.other_title}</span>
            )}
            <button
              onClick={() => onOpenProfile(friend)}
              className="truncate hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
            >
              {name}
            </button>
            <PremiumBadge
              premiumActive={friend.other_premium_active}
              premiumExpiresAt={friend.other_premium_expires_at}
            />
          </div>
          <div className="text-xs text-muted-foreground">@{friend.other_username}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <SeasonShield
              sp={friend.other_season_points ?? friend.other_rating ?? 0}
              size="xs"
              variant="chip"
            />
            <Pill tone={status.tone}>
              {status.icon && <status.icon className="h-3 w-3" />}
              {status.label}
            </Pill>
            {friend.other_country && (
              <Pill tone="muted">
                <MapPin className="h-3 w-3" /> {friend.other_country}
              </Pill>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => onTogglePin(friend.other_id)}
            aria-pressed={!!friend.is_pinned}
            aria-label={friend.is_pinned ? "Unpin friend" : "Pin friend (max 3)"}
            title={friend.is_pinned ? "Unpin friend" : "Pin friend (max 3)"}
            className={`grid h-7 w-7 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
              friend.is_pinned ? "bg-gold/15 text-gold" : "text-muted-foreground hover:bg-white/5"
            }`}
          >
            <Pin className="h-3.5 w-3.5" fill={friend.is_pinned ? "currentColor" : "none"} />
          </button>
          <button
            onClick={() => onToggleFavorite(friend.other_id)}
            aria-pressed={!!friend.is_favorite}
            aria-label={friend.is_favorite ? "Remove from favorites" : "Add to favorites"}
            title={friend.is_favorite ? "Remove from favorites" : "Add to favorites"}
            className={`grid h-7 w-7 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
              friend.is_favorite ? "bg-gold/15 text-gold" : "text-muted-foreground hover:bg-white/5"
            }`}
          >
            <Star className="h-3.5 w-3.5" fill={friend.is_favorite ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs">
        <div>
          <div className="text-muted-foreground">Rating</div>
          <div className="mt-0.5 font-stat text-gold">{friend.other_rating ?? 100}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Last seen</div>
          <div className="mt-0.5 flex items-center gap-1 text-foreground">
            <Clock className="h-3 w-3 text-muted-foreground" />
            {friend.other_is_online ? "Now" : relTime(friend.other_last_seen)}
          </div>
        </div>
        <div className="col-span-2">
          <div className="text-muted-foreground">Friends since</div>
          <div className="mt-0.5 text-foreground">{friendsSince(friend.created_at)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {friend.other_activity === "playing" && friend.other_active_game_id ? (
          <Link
            to="/game/$id"
            params={{ id: friend.other_active_game_id }}
            className="min-w-[7rem] flex-1"
          >
            <GhostButton className="w-full border-gold/40 text-gold">
              <Eye className="h-4 w-4" /> Watch Game
            </GhostButton>
          </Link>
        ) : (
          <GoldButton onClick={() => onOpenChallenge(friend)} className="flex-1 min-w-[7rem]">
            <Swords className="h-4 w-4" /> Challenge
          </GoldButton>
        )}
        <Link to="/profile" search={{ id: friend.other_id }}>
          <GhostButton>View Profile</GhostButton>
        </Link>
        <GhostButton disabled title="Coming soon">
          <MessageCircle className="h-4 w-4" />
        </GhostButton>
        <GhostButton onClick={() => onRemove(friend.id)} title="Remove friend">
          <UserX className="h-4 w-4" />
        </GhostButton>
      </div>
    </Card>
  );
}
