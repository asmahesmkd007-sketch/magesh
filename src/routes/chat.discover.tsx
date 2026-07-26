import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Hash, Loader2, Search } from "lucide-react";
import { Card } from "@/components/site/Primitives";
import { useChatActions, useDiscoverRooms } from "@/hooks/useChat";

export const Route = createFileRoute("/chat/discover")({
  head: () => ({ meta: [{ title: "Discover Rooms — Chat — ChessOx" }] }),
  component: DiscoverRooms,
});

function DiscoverRooms() {
  const [search, setSearch] = useState("");
  const { data: rooms = [], isLoading } = useDiscoverRooms(search || undefined);
  const { joinRoom } = useChatActions();

  return (
    <div className="h-full overflow-y-auto p-4">
      <Link
        to="/chat"
        className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold md:hidden"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All chats
      </Link>
      <h1 className="mb-3 text-lg font-medium">Discover rooms</h1>
      <div className="mb-4 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-4 py-2.5">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search public rooms…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      ) : rooms.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No public rooms yet — create the first one!
        </Card>
      ) : (
        <div className="space-y-2">
          {rooms.map((r) => (
            <Card key={r.id} className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/5 text-emerald">
                <Hash className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  to="/chat/room/$slug"
                  params={{ slug: r.slug ?? r.id }}
                  className="font-medium hover:underline"
                >
                  {r.name}
                </Link>
                {r.description && (
                  <p className="truncate text-xs text-muted-foreground">{r.description}</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {r.member_count} member{r.member_count === 1 ? "" : "s"}
                </p>
              </div>
              {!r.is_member && (
                <button
                  type="button"
                  onClick={() => joinRoom.mutate(r.id)}
                  className="shrink-0 rounded-full border border-gold/30 px-3 py-1.5 text-xs text-gold hover:bg-gold/10"
                >
                  Join
                </button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
