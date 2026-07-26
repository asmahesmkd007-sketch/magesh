// Chat left rail: Box 1 (category tabs) + Box 2 (room list for the active
// tab) + Box 3 (Direct Messages) + Box 4 (My Rooms) + Box 5 (Joined Rooms).
// Box 6 (Room Information) lives in ChannelView/RoomInfoPanel, opened from
// the room header once a room is selected. Public/Private room creation and
// joining is handled inside RoomBrowser's own toolbar (separate Create vs.
// Join modals per the redesign spec) — this file only assembles the rail.
import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, MessageSquare } from "lucide-react";
import { UserAvatar } from "@/components/site/UserAvatar";
import { GhostButton } from "@/components/site/Primitives";
import { useAuth } from "@/hooks/useAuth";
import { useChatActions, useMyChannels, useMyChannelsRealtime } from "@/hooks/useChat";
import { ChatFilterTabs, type ChatFilter } from "./ChatFilterTabs";
import { GlobalRoomsList, PrivateRoomsList, PublicRoomsList } from "./RoomBrowser";
import { useState } from "react";

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function sortNewest<T extends { created_at: string }>(items: T[]) {
  return [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function sectionHeader(label: string) {
  return (
    <div className="mb-1 mt-4 flex items-center justify-between px-1 first:mt-0">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function ChatSidebar() {
  useMyChannelsRealtime();
  const { user } = useAuth();
  const { data: channels = [] } = useMyChannels();
  const { leaveRoom } = useChatActions();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [filter, setFilter] = useState<ChatFilter>("global");

  const dms = channels.filter((c) => c.type === "dm");
  const myRooms = sortNewest(channels.filter((c) => c.type === "room" && c.owner_id === user?.id));
  const joinedRooms = sortNewest(
    channels.filter((c) => c.type === "room" && c.owner_id !== user?.id),
  );

  const rowClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors duration-150 ${
      active ? "bg-gold/10 text-gold" : "hover:bg-white/[0.04]"
    }`;

  return (
    <div className="flex h-full flex-col">
      {/* Box 1 — chat categories */}
      <div className="border-b border-white/10 p-3">
        <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-gold/80">
          Chat
        </h2>
        <ChatFilterTabs value={filter} onChange={setFilter} />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* Box 2 — room list for the active tab */}
        {filter === "global" && (
          <>
            {sectionHeader("Global Rooms")}
            <GlobalRoomsList />
          </>
        )}
        {filter === "public" && (
          <>
            {sectionHeader("Public Rooms")}
            <PublicRoomsList />
          </>
        )}
        {filter === "private" && (
          <>
            {sectionHeader("Private Rooms")}
            <PrivateRoomsList />
          </>
        )}

        {/* Box 3 — Direct Messages */}
        {sectionHeader("Direct Messages")}
        <div className="space-y-0.5">
          {dms.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/10 px-2.5 py-3 text-xs leading-relaxed text-muted-foreground">
              Message a player from their profile to start a DM.
            </p>
          )}
          {dms.map((c) => (
            <Link
              key={c.id}
              to="/chat/dm/$username"
              params={{ username: c.other_user?.username ?? "" }}
              className={rowClass(pathname === `/chat/dm/${c.other_user?.username}`)}
            >
              <UserAvatar
                avatarUrl={c.other_user?.avatar_url}
                displayName={c.other_user?.full_name}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.other_user?.full_name}</div>
                {c.last_message && (
                  <div className="truncate text-[11px] text-muted-foreground">
                    {c.last_message.content}
                  </div>
                )}
              </div>
              {c.unread_count > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1 text-[10px] font-medium text-background">
                  {c.unread_count > 99 ? "99+" : c.unread_count}
                </span>
              )}
              {!c.last_message && (
                <span className="text-[10px] text-muted-foreground">{relTime(c.created_at)}</span>
              )}
            </Link>
          ))}
        </div>

        {/* Box 4 — My Rooms (rooms owned by the current user) */}
        {sectionHeader("My Rooms")}
        <div className="space-y-1">
          {myRooms.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/10 px-2.5 py-3 text-xs leading-relaxed text-muted-foreground">
              Rooms you create will show up here.
            </p>
          )}
          {myRooms.map((r) => (
            <Link
              key={r.id}
              to="/chat/room/$slug"
              params={{ slug: r.slug ?? r.id }}
              className={rowClass(pathname === `/chat/room/${r.slug}`)}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-base">
                {r.icon ?? (r.is_private ? "🔒" : "🌐")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}</div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">
                  {r.room_code ?? r.slug} · {r.member_count} member{r.member_count === 1 ? "" : "s"}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${r.is_private ? "bg-rose-500/15 text-rose-300" : "bg-emerald/15 text-emerald"}`}
              >
                {r.is_private ? "Private" : "Public"}
              </span>
            </Link>
          ))}
        </div>

        {/* Box 5 — Joined Rooms (rooms the user belongs to but doesn't own) */}
        {sectionHeader("Joined Rooms")}
        <div className="space-y-1">
          {joinedRooms.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/10 px-2.5 py-3 text-xs leading-relaxed text-muted-foreground">
              Rooms you join will show up here.
            </p>
          )}
          {joinedRooms.map((r) => (
            <div
              key={r.id}
              className="group rounded-xl px-2.5 py-2 transition-colors duration-150 hover:bg-white/[0.04]"
            >
              <Link
                to="/chat/room/$slug"
                params={{ slug: r.slug ?? r.id }}
                className="flex items-center gap-2.5 text-sm"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-base">
                  {r.icon ?? (r.is_private ? "🔒" : "🌐")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {r.owner && <>@{r.owner.username} · </>}
                    {r.member_count} member{r.member_count === 1 ? "" : "s"} · {r.online_count}{" "}
                    online
                  </div>
                </div>
              </Link>
              <div className="mt-1.5 flex justify-end gap-1.5 pl-10 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Leave "${r.name}"?`)) leaveRoom.mutate(r.id);
                  }}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:text-rose-400"
                >
                  <LogOut className="h-3 w-3" /> Leave
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
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
