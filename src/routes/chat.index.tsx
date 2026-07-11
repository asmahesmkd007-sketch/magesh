// /chat — desktop: empty state (pick a channel from the rail).
// mobile: the channel list itself, since the rail is hidden below md.
import { createFileRoute, Link } from "@tanstack/react-router";
import { Globe2, Hash, Plus } from "lucide-react";
import { useState } from "react";
import { UserAvatar } from "@/components/site/UserAvatar";
import { useMyChannels } from "@/hooks/useChat";
import { ChatEmptyState } from "@/components/chat/ChatSidebar";
import { CreateRoomModal } from "@/components/chat/CreateRoomModal";

export const Route = createFileRoute("/chat/")({
  component: ChatIndex,
});

function ChatIndex() {
  const { data: channels = [] } = useMyChannels();
  const [creating, setCreating] = useState(false);
  const global = channels.find((c) => c.type === "global");
  const rooms = channels.filter((c) => c.type === "room");
  const dms = channels.filter((c) => c.type === "dm");

  return (
    <>
      <div className="hidden h-full md:block">
        <ChatEmptyState />
      </div>
      <div className="h-full overflow-y-auto p-3 md:hidden">
        <h1 className="mb-3 px-1 text-lg font-medium">Chat</h1>
        {global && (
          <Link to="/chat/global" className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-white/[0.04]">
            <span className="grid h-10 w-10 place-items-center rounded-full gradient-gold text-background">
              <Globe2 className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">Global Chat</div>
              <div className="truncate text-xs text-muted-foreground">
                {global.last_message?.content ?? "Every ChessOX player, one room"}
              </div>
            </div>
            {global.unread_count > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1 text-[10px] text-background">
                {global.unread_count}
              </span>
            )}
          </Link>
        )}
        {dms.map((c) => (
          <Link key={c.id} to="/chat/dm/$username" params={{ username: c.other_user?.username ?? "" }} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-white/[0.04]">
            <UserAvatar avatarUrl={c.other_user?.avatar_url} displayName={c.other_user?.display_name} size="md" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{c.other_user?.display_name}</div>
              {c.last_message && <div className="truncate text-xs text-muted-foreground">{c.last_message.content}</div>}
            </div>
            {c.unread_count > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1 text-[10px] text-background">
                {c.unread_count}
              </span>
            )}
          </Link>
        ))}
        {rooms.map((c) => (
          <Link key={c.id} to="/chat/room/$slug" params={{ slug: c.slug ?? c.id }} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-white/[0.04]">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-emerald">
              <Hash className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-muted-foreground">{c.member_count} members</div>
            </div>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-2 flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-muted-foreground hover:bg-white/[0.04] hover:text-gold"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full border border-dashed border-white/15">
            <Plus className="h-4 w-4" />
          </span>
          Create room
        </button>
        <Link to="/chat/discover" className="mt-1 block px-2.5 py-2 text-sm text-gold">
          Discover rooms →
        </Link>
      </div>
      {creating && <CreateRoomModal onClose={() => setCreating(false)} />}
    </>
  );
}
