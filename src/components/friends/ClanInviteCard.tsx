import { Check, X, Shield, Crown, Users } from "lucide-react";
import { Card, GoldButton, GhostButton, Pill } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import type { ClanInviteRow } from "@/types/friend";

export function ClanInviteCard({
  invite,
  onRespond,
  style,
}: {
  invite: ClanInviteRow;
  onRespond: (id: string, accept: boolean) => void;
  style?: React.CSSProperties;
}) {
  return (
    <Card
      style={style}
      className="animate-rise-in flex flex-col gap-3 p-4 transition-colors duration-200 hover:border-gold/20 sm:flex-row sm:items-center"
    >
      {invite.clan_logo_url ? (
        <UserAvatar
          avatarUrl={invite.clan_logo_url}
          displayName={invite.clan_name}
          size="sm"
          shape="rounded-xl"
        />
      ) : (
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-gold text-[#0B0D10] shadow-gold-glow">
          <Shield className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          {invite.inviter_display ?? invite.inviter_username ?? "Someone"} invited you to join{" "}
          <span className="font-medium text-gold">{invite.clan_name ?? "a clan"}</span>
          {invite.clan_tag && <span className="text-muted-foreground"> [{invite.clan_tag}]</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {invite.clan_leader_name && (
            <Pill tone="muted">
              <Crown className="h-3 w-3" /> {invite.clan_leader_name}
            </Pill>
          )}
          {typeof invite.clan_member_count === "number" && (
            <Pill tone="muted">
              <Users className="h-3 w-3" /> {invite.clan_member_count} members
            </Pill>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <GoldButton onClick={() => onRespond(invite.id, true)} className="flex-1 sm:flex-none">
          <Check className="h-4 w-4" /> Accept
        </GoldButton>
        <GhostButton onClick={() => onRespond(invite.id, false)} className="flex-1 sm:flex-none">
          <X className="h-4 w-4" /> Reject
        </GhostButton>
      </div>
    </Card>
  );
}
