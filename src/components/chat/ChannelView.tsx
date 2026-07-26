// Shared header + message list + composer used by Global Chat, Room, and
// DM routes. Handles the join-public-room / private-room-locked / muted
// / banned states so each route file stays a thin data-loader.
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Globe2,
  Hash,
  Info,
  Loader2,
  Lock,
  LogOut,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";
import { UserAvatar } from "@/components/site/UserAvatar";
import { GoldButton } from "@/components/site/Primitives";
import { useAuth } from "@/hooks/useAuth";
import { useChannelMembers, useChatActions, useTypingIndicator } from "@/hooks/useChat";
import type { ChatChannel, ChatMessage } from "@/lib/api/chatClient";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { MemberPanel } from "./MemberPanel";
import { RoomSettingsModal } from "./RoomSettingsModal";
import { RoomInfoPanel } from "./RoomInfoPanel";

export function ChannelView({ channel }: { channel: ChatChannel }) {
  const { user } = useAuth();
  const actions = useChatActions();
  const { data: members = [] } = useChannelMembers(
    channel.type === "room" ? channel.id : undefined,
  );
  const { typingNames } = useTypingIndicator(channel.id);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (user && channel.is_member) actions.markRead.mutate(channel.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, user?.id]);

  const isOwner = channel.owner_id === user?.id;
  const isStaff = channel.my_role === "owner" || channel.my_role === "moderator";
  const myMembership = members.find((m) => m.id === user?.id);
  const muted = myMembership?.muted_until && new Date(myMembership.muted_until) > new Date();

  let disabledReason: string | null = null;
  if (!user)
    disabledReason = null; // Composer shows its own sign-in prompt
  else if (channel.type === "room" && !channel.is_member && channel.is_private)
    disabledReason = "This is a private room — you need an invite to join.";
  else if (muted)
    disabledReason = `You are muted until ${new Date(myMembership!.muted_until!).toLocaleTimeString("en-IN")}.`;

  const title =
    channel.type === "global"
      ? "Global Chat"
      : channel.type === "dm"
        ? channel.other_user?.full_name
        : channel.name;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        {channel.type === "global" && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full gradient-gold text-background text-base">
            {channel.icon ?? <Globe2 className="h-4 w-4" />}
          </span>
        )}
        {channel.type === "room" && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/5 text-emerald text-base">
            {channel.icon ??
              (channel.is_private ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />)}
          </span>
        )}
        {channel.type === "dm" && channel.other_user && (
          <Link to="/u/$username" params={{ username: channel.other_user.username }}>
            <UserAvatar
              avatarUrl={channel.other_user.avatar_url}
              displayName={channel.other_user.full_name}
              size="sm"
            />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {channel.type === "global" && (
              <>
                ID: {channel.slug} · {channel.member_count} members · {channel.online_count} online
              </>
            )}
            {channel.type === "room" && (
              <>
                {channel.room_code && <>ID: {channel.room_code} · </>}
                {channel.member_count} member{channel.member_count === 1 ? "" : "s"} ·{" "}
                {channel.online_count} online
              </>
            )}
            {channel.type === "dm" && `@${channel.other_user?.username}`}
          </div>
        </div>
        {channel.type === "room" && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setShowInfo(true)}
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.05] hover:text-gold"
              aria-label="Room information"
            >
              <Info className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowMembers(true)}
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.05] hover:text-gold"
              aria-label="Members"
            >
              <Users className="h-4 w-4" />
            </button>
            {isOwner && (
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.05] hover:text-gold"
                aria-label="Room settings"
              >
                <SettingsIcon className="h-4 w-4" />
              </button>
            )}
            {channel.is_member && !isOwner && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Leave this room?")) actions.leaveRoom.mutate(channel.id);
                }}
                className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.05] hover:text-rose-400"
                aria-label="Leave room"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {channel.type === "room" && !channel.is_private && !channel.is_member && user && (
        <div className="flex items-center justify-between gap-3 border-b border-gold/20 bg-gold/[0.04] px-4 py-2.5">
          <span className="text-xs text-muted-foreground">Join this room to post messages.</span>
          <GoldButton
            onClick={() => actions.joinRoom.mutate(channel.id)}
            disabled={actions.joinRoom.isPending}
            className="!px-4 !py-1.5 text-xs"
          >
            {actions.joinRoom.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Join"}
          </GoldButton>
        </div>
      )}

      <MessageList channelId={channel.id} isStaff={isStaff} onReply={setReplyTo} />
      {typingNames.length > 0 && (
        <div className="px-4 pb-1 text-[11px] italic text-muted-foreground">
          {typingNames.slice(0, 3).join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
        </div>
      )}
      <Composer
        channelId={channel.id}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        disabledReason={disabledReason}
      />

      {showMembers && <MemberPanel channel={channel} onClose={() => setShowMembers(false)} />}
      {showSettings && (
        <RoomSettingsModal channel={channel} onClose={() => setShowSettings(false)} />
      )}
      {showInfo && <RoomInfoPanel channel={channel} onClose={() => setShowInfo(false)} />}
    </div>
  );
}
