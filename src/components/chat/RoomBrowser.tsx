// Column 2 content for the Global / Public Rooms / Private Rooms filter
// tabs (ChatFilterTabs). Global lists the 14 permanent rooms (auto-join,
// cannot be deleted/renamed). Public/Private show search + Room ID join.
import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Loader2, Lock, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/site/Primitives";
import {
  useChatActions,
  useDiscoverPrivateRooms,
  useDiscoverRooms,
  usePermanentRooms,
} from "@/hooks/useChat";
import type { ChatChannel } from "@/lib/api/chatClient";

function relTime(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function rowClass(active: boolean) {
  return `flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition ${
    active ? "bg-gold/10 text-gold" : "hover:bg-white/[0.04]"
  }`;
}

export function GlobalRoomsList() {
  const { data: rooms = [], isLoading } = usePermanentRooms();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (isLoading) {
    return (
      <div className="grid place-items-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {rooms.map((r) => {
        if (r.coming_soon) {
          return (
            <div
              key={r.id}
              className="flex cursor-not-allowed items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm opacity-50"
              title="Coming soon"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-base">
                {r.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}</div>
              </div>
              <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
                COMING SOON
              </span>
            </div>
          );
        }

        const content = (
          <>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-base">
              {r.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{r.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {r.member_count} member{r.member_count === 1 ? "" : "s"} · {r.online_count} online
              </div>
            </div>
            {r.unread_count > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1 text-[10px] font-medium text-background">
                {r.unread_count > 99 ? "99+" : r.unread_count}
              </span>
            )}
          </>
        );

        return r.type === "global" ? (
          <Link key={r.id} to="/chat/global" className={rowClass(pathname === "/chat/global")}>
            {content}
          </Link>
        ) : (
          <Link key={r.id} to="/chat/room/$slug" params={{ slug: r.slug ?? r.id }} className={rowClass(pathname === `/chat/room/${r.slug}`)}>
            {content}
          </Link>
        );
      })}
    </div>
  );
}

function RoomCard({ room, isPrivate }: { room: ChatChannel; isPrivate: boolean }) {
  const { joinRoom, joinPrivateRoom } = useChatActions();
  const [password, setPassword] = useState("");
  const [joining, setJoining] = useState(false);

  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/5 text-base">
          {room.icon ?? (isPrivate ? "🔒" : "🌐")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {room.is_member ? (
              <Link to="/chat/room/$slug" params={{ slug: room.slug ?? room.id }} className="truncate font-medium hover:underline">
                {room.name}
              </Link>
            ) : (
              <span className="truncate font-medium">{room.name}</span>
            )}
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${isPrivate ? "bg-rose-500/15 text-rose-300" : "bg-emerald/15 text-emerald"}`}>
              {isPrivate ? "Private" : "Public"}
            </span>
            {isPrivate && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            ID: <span className="font-mono">{room.room_code ?? room.slug}</span>
            {room.owner && <> · Owner @{room.owner.username}</>}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {room.member_count}
            </span>
            <span>{room.online_count} online</span>
            {room.last_message && <span className="truncate">· {relTime(room.last_message.created_at)}</span>}
          </div>
          {room.last_message && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{room.last_message.content}</p>
          )}
        </div>
        {room.unread_count > 0 && (
          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-gold px-1 text-[10px] font-medium text-background">
            {room.unread_count > 99 ? "99+" : room.unread_count}
          </span>
        )}
      </div>

      {!room.is_member && (
        <div className="mt-2.5 flex items-center gap-1.5">
          {isPrivate && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-xs outline-none focus:border-gold/40"
            />
          )}
          <button
            type="button"
            disabled={joining || (isPrivate && !password.trim())}
            onClick={() => {
              setJoining(true);
              if (isPrivate) {
                joinPrivateRoom.mutate(
                  { roomCode: room.room_code ?? room.slug ?? "", password: password.trim() },
                  { onSettled: () => setJoining(false) },
                );
              } else {
                joinRoom.mutate(room.id, { onSettled: () => setJoining(false) });
              }
            }}
            className="shrink-0 rounded-lg border border-gold/30 px-3 py-1.5 text-xs text-gold hover:bg-gold/10 disabled:opacity-40"
          >
            {joining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Join"}
          </button>
        </div>
      )}
    </Card>
  );
}

export function PublicRoomsList() {
  const [search, setSearch] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");
  const { data: rooms = [], isLoading } = useDiscoverRooms(search || undefined);
  const { joinRoom } = useChatActions();

  const joinById = () => {
    const target = rooms.find((r) => r.room_code === roomIdInput.trim() || r.slug === roomIdInput.trim());
    if (!target) return toast.error("Room ID not found");
    joinRoom.mutate(target.id);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by room name or ID…"
          className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={roomIdInput}
          onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
          placeholder="Have a Room ID? ROOM-XXXXXXXX"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-xs font-mono outline-none focus:border-gold/40"
        />
        <button
          type="button"
          onClick={joinById}
          disabled={!roomIdInput.trim() || joinRoom.isPending}
          className="shrink-0 rounded-lg gradient-gold px-3 py-1.5 text-xs font-medium text-background disabled:opacity-40"
        >
          Join
        </button>
      </div>
      {isLoading ? (
        <div className="grid place-items-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gold" />
        </div>
      ) : rooms.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No public rooms found.</p>
      ) : (
        <div className="space-y-2">
          {rooms.map((r) => (
            <RoomCard key={r.id} room={r} isPrivate={false} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PrivateRoomsList() {
  const [search, setSearch] = useState("");
  const { data: rooms = [], isLoading } = useDiscoverPrivateRooms(search || undefined);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by room name or ID…"
          className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Enter the Room ID and password on a room card to join. Passwords are verified on the server and never shared with the app.
      </p>
      {isLoading ? (
        <div className="grid place-items-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gold" />
        </div>
      ) : rooms.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No private rooms found.</p>
      ) : (
        <div className="space-y-2">
          {rooms.map((r) => (
            <RoomCard key={r.id} room={r} isPrivate />
          ))}
        </div>
      )}
    </div>
  );
}
