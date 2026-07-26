// Room member list + owner/moderator controls: invite, remove, mute,
// ban, assign moderator. Shown as a slide-over panel from the room
// header. Only rendered for room channels (not global/DM).
import { useState } from "react";
import { Ban, Crown, Loader2, Shield, UserMinus, UserPlus, VolumeX, X } from "lucide-react";
import { UserAvatar } from "@/components/site/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { useChannelMembers, useChatActions } from "@/hooks/useChat";
import type { ChatChannel } from "@/lib/api/chatClient";

export function MemberPanel({ channel, onClose }: { channel: ChatChannel; onClose: () => void }) {
  const { user } = useAuth();
  const { data: members = [], isLoading } = useChannelMembers(channel.id);
  const actions = useChatActions();
  const [inviteName, setInviteName] = useState("");
  const isOwner = channel.owner_id === user?.id;
  const isStaff = channel.my_role === "owner" || channel.my_role === "moderator";

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xs flex-col border-l border-white/10 bg-[#0d0f13]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h3 className="text-sm font-medium">Members ({members.length})</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {isStaff && (
          <div className="border-b border-white/10 p-3">
            <div className="flex gap-2">
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="username"
                className="flex-1 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs outline-none focus:border-gold/40"
              />
              <button
                type="button"
                disabled={!inviteName.trim() || actions.invite.isPending}
                onClick={() =>
                  actions.invite.mutate(
                    { channelId: channel.id, username: inviteName.trim() },
                    { onSuccess: () => setInviteName("") },
                  )
                }
                className="flex items-center gap-1 rounded-lg bg-gold/15 px-3 py-1.5 text-xs text-gold disabled:opacity-40"
              >
                <UserPlus className="h-3.5 w-3.5" /> Invite
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="grid place-items-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-gold" />
            </div>
          ) : (
            members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-white/[0.03]"
              >
                <UserAvatar avatarUrl={m.avatar_url} displayName={m.full_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate text-sm">
                    {m.full_name}
                    {m.role === "owner" && <Crown className="h-3 w-3 text-gold" />}
                    {m.role === "moderator" && <Shield className="h-3 w-3 text-emerald" />}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    @{m.username}
                    {m.muted_until && new Date(m.muted_until) > new Date() && " · muted"}
                  </div>
                </div>
                {isStaff && m.id !== user?.id && m.role !== "owner" && (
                  <div className="flex shrink-0 gap-1">
                    {isOwner && (
                      <button
                        type="button"
                        title={m.role === "moderator" ? "Remove moderator" : "Make moderator"}
                        onClick={() =>
                          actions.setModerator.mutate({
                            channelId: channel.id,
                            userId: m.id,
                            isMod: m.role !== "moderator",
                          })
                        }
                        className={`grid h-7 w-7 place-items-center rounded-full ${m.role === "moderator" ? "text-emerald" : "text-muted-foreground hover:text-emerald"}`}
                      >
                        <Shield className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Mute 60 min"
                      onClick={() =>
                        actions.muteMember.mutate({
                          channelId: channel.id,
                          userId: m.id,
                          minutes: 60,
                        })
                      }
                      className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:text-gold"
                    >
                      <VolumeX className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Remove"
                      onClick={() => {
                        if (window.confirm(`Remove @${m.username} from the room?`))
                          actions.removeMember.mutate({ channelId: channel.id, userId: m.id });
                      }}
                      className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:text-rose-400"
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Ban"
                      onClick={() => {
                        if (window.confirm(`Ban @${m.username} from the room?`))
                          actions.removeMember.mutate({
                            channelId: channel.id,
                            userId: m.id,
                            ban: true,
                          });
                      }}
                      className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:text-rose-400"
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
