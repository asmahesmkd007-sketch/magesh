import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { UserCheck, UserX, Users, Clock3, MapPin } from "lucide-react";
import { Card, GoldButton, GhostButton, Pill } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { supabase } from "@/integrations/supabase/client";
import type { FriendRow } from "@/types/friend";

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function IncomingRequestCard({
  request,
  myFriendIds,
  onAccept,
  onReject,
  style,
}: {
  request: FriendRow;
  myFriendIds: Set<string>;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  style?: React.CSSProperties;
}) {
  const [mutual, setMutual] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("friends")
      .select("requester_id,addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${request.other_id},addressee_id.eq.${request.other_id}`)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const theirFriendIds = data.map((r) =>
          r.requester_id === request.other_id ? r.addressee_id : r.requester_id,
        );
        const count = theirFriendIds.filter(
          (id): id is string => !!id && myFriendIds.has(id),
        ).length;
        setMutual(count);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.other_id]);

  return (
    <Card
      style={style}
      className="animate-rise-in flex flex-col gap-3 p-4 transition-colors duration-200 hover:border-gold/20 sm:flex-row sm:items-center sm:gap-3"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <UserAvatar
          avatarUrl={request.other_avatar_url}
          displayName={request.other_display ?? request.other_username}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center text-sm">
            {request.other_display ?? request.other_username ?? "Unknown"}
            <PremiumBadge
              premiumActive={request.other_premium_active}
              premiumExpiresAt={request.other_premium_expires_at}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            @{request.other_username}
            {typeof request.other_rating === "number" && <> · {request.other_rating} rating</>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {request.other_country && (
              <Pill tone="muted">
                <MapPin className="h-3 w-3" /> {request.other_country}
              </Pill>
            )}
            {!!mutual && (
              <span className="flex items-center gap-1 text-[11px] text-gold/70">
                <Users className="h-3 w-3" /> {mutual} mutual friend{mutual === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <GoldButton onClick={() => onAccept(request.id)} className="flex-1 sm:flex-none">
          <UserCheck className="h-4 w-4" /> Accept
        </GoldButton>
        <GhostButton onClick={() => onReject(request.id)} className="flex-1 sm:flex-none">
          <UserX className="h-4 w-4" /> Reject
        </GhostButton>
        <Link to="/profile" search={{ id: request.other_id }}>
          <GhostButton>View Profile</GhostButton>
        </Link>
      </div>
    </Card>
  );
}

export function OutgoingRequestCard({
  request,
  onCancel,
  style,
}: {
  request: FriendRow;
  onCancel: (id: string) => void;
  style?: React.CSSProperties;
}) {
  return (
    <Card
      style={style}
      className="animate-rise-in flex items-center gap-3 p-4 transition-colors duration-200 hover:border-gold/20"
    >
      <UserAvatar
        avatarUrl={request.other_avatar_url}
        displayName={request.other_display ?? request.other_username}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center text-sm">
          {request.other_display ?? request.other_username ?? "Unknown"}
          <PremiumBadge
            premiumActive={request.other_premium_active}
            premiumExpiresAt={request.other_premium_expires_at}
          />
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock3 className="h-3 w-3 animate-pulse-dot" /> Pending · sent{" "}
          {relTime(request.created_at)}
        </div>
      </div>
      <GhostButton onClick={() => onCancel(request.id)}>Cancel Request</GhostButton>
    </Card>
  );
}
