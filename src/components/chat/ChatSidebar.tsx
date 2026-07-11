// Column 1 (filter) + Column 2 (room/channel list) — stacked in one
// rail. Filter defaults to Global; switching it swaps Column 2 content
// instantly (client-side state only). Direct Messages stay reachable
// below the filtered list since they're wired in from user profiles
// elsewhere in the app.
import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { MessageSquare, Plus } from "lucide-react";
import { UserAvatar } from "@/components/site/UserAvatar";
import { GhostButton } from "@/components/site/Primitives";
import { useMyChannels, useMyChannelsRealtime } from "@/hooks/useChat";
import { CreateRoomModal } from "./CreateRoomModal";
import { ChatFilterTabs, type ChatFilter } from "./ChatFilterTabs";
import { GlobalRoomsList, PrivateRoomsList, PublicRoomsList } from "./RoomBrowser";

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function ChatSidebar() {
  useMyChannelsRealtime();
  const { data: channels = [] } = useMyChannels();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<ChatFilter>("global");

  const dms = channels.filter((c) => c.type === "dm");

  const rowClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition ${
      active ? "bg-gold/10 text-gold" : "hover:bg-white/[0.04]"
    }`;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 p-3">
        <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-gold/80">Chat</h2>
        <ChatFilterTabs value={filter} onChange={setFilter} />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filter === "global" && (
          <>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Global Rooms
              </span>
            </div>
            <GlobalRoomsList />
          </>
        )}

        {filter === "public" && (
          <>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Public Rooms
              </span>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.05] hover:text-gold"
                aria-label="Create room"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <PublicRoomsList />
          </>
        )}

        {filter === "private" && (
          <>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Private Rooms
              </span>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.05] hover:text-gold"
                aria-label="Create room"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <PrivateRoomsList />
          </>
        )}

        <div className="mt-4 flex items-center justify-between px-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Direct Messages
          </span>
        </div>
        <div className="mt-1 space-y-0.5">
          {dms.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">
              Message a player from their profile to start a DM.
            </p>
          )}
          {dms.map((c) => (
            <Link key={c.id} to="/chat/dm/$username" params={{ username: c.other_user?.username ?? "" }} className={rowClass(pathname === `/chat/dm/${c.other_user?.username}`)}>
              <UserAvatar avatarUrl={c.other_user?.avatar_url} displayName={c.other_user?.full_name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.other_user?.full_name}</div>
                {c.last_message && (
                  <div className="truncate text-[11px] text-muted-foreground">{c.last_message.content}</div>
                )}
              </div>
              {c.unread_count > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1 text-[10px] font-medium text-background">
                  {c.unread_count > 99 ? "99+" : c.unread_count}
                </span>
              )}
              {!c.last_message && <span className="text-[10px] text-muted-foreground">{relTime(c.created_at)}</span>}
            </Link>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-4 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-muted-foreground hover:bg-white/[0.04] hover:text-gold"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-white/15">
            <Plus className="h-4 w-4" />
          </span>
          Create room
        </button>
      </div>

      {creating && <CreateRoomModal onClose={() => setCreating(false)} />}
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
