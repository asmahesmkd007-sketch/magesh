import { Link, useRouterState } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { GhostButton } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import { useMyChannels, useMyChannelsRealtime } from "@/hooks/useChat";
import { ChatFilterTabs, type ChatFilter } from "./ChatFilterTabs";
import { PrivateRoomsList, PublicRoomsList } from "./RoomBrowser";
import { useState } from "react";

export function ChatSidebar() {
  useMyChannelsRealtime();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [roomTab, setRoomTab] = useState<ChatFilter>("public");

  const isGlobalActive = pathname === "/chat/global";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-white/10 p-3">
        <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-gold/80">Chat</h2>

        {/* Global Chat direct button */}
        <Link
          to="/chat/global"
          className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-150 ${
            isGlobalActive
              ? "border-gold/50 bg-gold/15 text-gold shadow-sm"
              : "border-white/10 bg-white/[0.02] text-foreground hover:border-white/20 hover:bg-white/[0.05]"
          }`}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full gradient-gold text-base text-background">
            🌍
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">Global Chat</div>
            <div className="truncate text-[11px] text-muted-foreground">
              Every ChessOx player, one room
            </div>
          </div>
        </Link>

        {/* 2 Tabs: Public Rooms & Private Rooms */}
        <ChatFilterTabs value={roomTab} onChange={setRoomTab} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {roomTab === "public" && <PublicRoomsList />}
        {roomTab === "private" && <PrivateRoomsList />}
        <DirectMessagesSection />
      </div>
    </div>
  );
}

/**
 * Mobile-only DM list. Desktop reaches DMs from a player's profile and its
 * rail has never listed them, so this stays `md:hidden` to leave that layout
 * untouched — but below md this sidebar *is* the whole /chat screen, and it
 * replaced a mobile list that did show DM threads. Without this, open DMs
 * would have no entry point on a phone.
 */
function DirectMessagesSection() {
  const { data: channels = [] } = useMyChannels();
  const dms = channels.filter((c) => c.type === "dm");
  if (dms.length === 0) return null;

  return (
    <div className="mt-4 border-t border-white/10 pt-3 md:hidden">
      <h3 className="px-1 pb-1 text-xs font-medium uppercase tracking-wider text-gold/80">
        Direct Messages
      </h3>
      {dms.map((c) => (
        <Link
          key={c.id}
          to="/chat/dm/$username"
          params={{ username: c.other_user?.username ?? "" }}
          className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-white/[0.04]"
        >
          <UserAvatar
            avatarUrl={c.other_user?.avatar_url}
            displayName={c.other_user?.full_name}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{c.other_user?.full_name}</div>
            {c.last_message && (
              <div className="truncate text-xs text-muted-foreground">{c.last_message.content}</div>
            )}
          </div>
          {c.unread_count > 0 && (
            <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-gold px-1 text-[10px] text-background">
              {c.unread_count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

export function ChatEmptyState() {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div>
        <MessageSquare className="mx-auto h-10 w-10 text-gold/30" />
        <p className="mt-4 text-sm text-muted-foreground">Pick a conversation from the left, or</p>
        <Link to="/chat/global" className="mt-3 inline-block">
          <GhostButton className="!px-5 !py-2">Open Global Chat</GhostButton>
        </Link>
      </div>
    </div>
  );
}
