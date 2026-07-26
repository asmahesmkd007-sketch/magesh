import { Check, X, Shield } from "lucide-react";
import { Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import type { ClanInviteRow } from "@/types/friend";

export function ClanInviteCard({
  invite,
  onRespond,
}: {
  invite: ClanInviteRow;
  onRespond: (id: string, accept: boolean) => void;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      {invite.clan_logo_url ? (
        <UserAvatar
          avatarUrl={invite.clan_logo_url}
          displayName={invite.clan_name}
          size="sm"
          shape="rounded-xl"
        />
      ) : (
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl gradient-gold text-[#0B0D10]">
          <Shield className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          {invite.inviter_display ?? invite.inviter_username ?? "Someone"} invited you to join{" "}
          <span className="font-medium text-gold">{invite.clan_name ?? "a clan"}</span>
          {invite.clan_tag && <span className="text-muted-foreground"> [{invite.clan_tag}]</span>}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <GoldButton onClick={() => onRespond(invite.id, true)}>
          <Check className="h-4 w-4" /> Accept
        </GoldButton>
        <GhostButton onClick={() => onRespond(invite.id, false)}>
          <X className="h-4 w-4" /> Reject
        </GhostButton>
      </div>
    </Card>
  );
}
