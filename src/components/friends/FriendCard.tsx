import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Swords, UserX, MessageCircle, MapPin, Clock } from "lucide-react";
import { Card, GoldButton, GhostButton, Pill } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { ChallengeModal } from "@/components/friends/ChallengeModal";
import type { FriendRow } from "@/types/friend";
import type { TimeClass } from "@/lib/api/gameClient";

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

export function FriendCard({
  friend,
  onRemove,
  onChallenge,
}: {
  friend: FriendRow;
  onRemove: (id: string) => void;
  onChallenge: (
    opponentId: string,
    opts: {
      timeClass: TimeClass;
      timeControl: string;
      initialSeconds: number;
      incrementSeconds: number;
      isRated: boolean;
    },
  ) => Promise<void>;
}) {
  const [showChallenge, setShowChallenge] = useState(false);
  const name = friend.other_display ?? friend.other_username ?? "Unknown";

  return (
    <Card className="flex flex-col gap-4 p-5 transition duration-200 hover:border-gold/20 hover:shadow-gold-glow/10">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <Link to="/profile" search={{ id: friend.other_id }}>
            <UserAvatar avatarUrl={friend.other_avatar_url} displayName={name} size="md" />
          </Link>
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background ${
              friend.other_is_online ? "bg-emerald" : "bg-white/20"
            }`}
            title={friend.other_is_online ? "Online" : "Offline"}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-sm font-medium">
            <Link
              to="/profile"
              search={{ id: friend.other_id }}
              className="truncate hover:text-gold"
            >
              {name}
            </Link>
            <PremiumBadge
              premiumActive={friend.other_premium_active}
              premiumExpiresAt={friend.other_premium_expires_at}
            />
          </div>
          <div className="text-xs text-muted-foreground">@{friend.other_username}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Pill tone={friend.other_is_online ? "emerald" : "muted"}>
              {friend.other_is_online ? "Online" : "Offline"}
            </Pill>
            {friend.other_country && (
              <Pill tone="muted">
                <MapPin className="h-3 w-3" /> {friend.other_country}
              </Pill>
            )}
          </div>
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
        <GoldButton onClick={() => setShowChallenge(true)} className="flex-1 min-w-[7rem]">
          <Swords className="h-4 w-4" /> Challenge
        </GoldButton>
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

      {showChallenge && (
        <ChallengeModal
          opponentName={name}
          onClose={() => setShowChallenge(false)}
          onSend={(opts) => onChallenge(friend.other_id, opts)}
        />
      )}
    </Card>
  );
}
