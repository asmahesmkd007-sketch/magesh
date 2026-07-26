import { useEffect, useState } from "react";
import { UserCheck, UserX, Users } from "lucide-react";
import { Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { supabase } from "@/integrations/supabase/client";
import type { FriendRow } from "@/types/friend";

export function IncomingRequestCard({
  request,
  myFriendIds,
  onAccept,
  onReject,
}: {
  request: FriendRow;
  myFriendIds: Set<string>;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
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
    <Card className="flex items-center gap-3 p-4">
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
        {!!mutual && (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gold/70">
            <Users className="h-3 w-3" /> {mutual} mutual friend{mutual === 1 ? "" : "s"}
          </div>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <GoldButton onClick={() => onAccept(request.id)}>
          <UserCheck className="h-4 w-4" /> Accept
        </GoldButton>
        <GhostButton onClick={() => onReject(request.id)}>
          <UserX className="h-4 w-4" /> Reject
        </GhostButton>
      </div>
    </Card>
  );
}

export function OutgoingRequestCard({
  request,
  onCancel,
}: {
  request: FriendRow;
  onCancel: (id: string) => void;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
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
        <div className="text-xs text-muted-foreground">@{request.other_username} · Pending</div>
      </div>
      <GhostButton onClick={() => onCancel(request.id)}>Cancel Request</GhostButton>
    </Card>
  );
}
