// Scrollable message feed for a channel: infinite-scroll-up pagination,
// realtime updates, search-within-channel, and a pinned-messages strip.
import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Pin, Search, X } from "lucide-react";
import { useChannelFeed, useChannelRealtime, usePinnedMessages } from "@/hooks/useChat";
import * as api from "@/lib/api/chatClient";
import type { ChatMessage } from "@/lib/api/chatClient";
import { MessageBubble } from "./MessageBubble";

export function MessageList({
  channelId,
  isStaff,
  onReply,
}: {
  channelId: string;
  isStaff: boolean;
  onReply: (msg: ChatMessage) => void;
}) {
  useChannelRealtime(channelId);
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useChannelFeed(channelId);
  const { data: pinned = [] } = usePinnedMessages(channelId);
  const [showPinned, setShowPinned] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatMessage[] | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstLoad = useRef(true);

  const messages = [...(data?.pages.flat() ?? [])].reverse();

  useEffect(() => {
    if (!isLoading && firstLoad.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
      firstLoad.current = false;
    }
  }, [isLoading]);

  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  async function runSearch(q: string) {
    setQuery(q);
    if (!q.trim()) return setResults(null);
    setResults(await api.searchMessages(channelId, q.trim()));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        {searching ? (
          <div className="flex flex-1 items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="Search this conversation…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => {
                setSearching(false);
                setQuery("");
                setResults(null);
              }}
              aria-label="Close search"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1" />
            {pinned.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPinned((s) => !s)}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${showPinned ? "bg-gold/15 text-gold" : "text-muted-foreground hover:text-gold"}`}
              >
                <Pin className="h-3.5 w-3.5" /> {pinned.length}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSearching(true)}
              className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.05] hover:text-gold"
              aria-label="Search"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {showPinned && !searching && (
        <div className="max-h-40 space-y-1 overflow-y-auto border-b border-white/10 bg-gold/[0.03] p-2">
          {pinned.map((m) => (
            <div key={m.id} className="rounded-lg px-2 py-1 text-xs">
              <span className="text-gold">{m.author.display_name}:</span> {m.content}
            </div>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2">
        {results !== null ? (
          <div className="space-y-1">
            {results.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">No messages match "{query}".</p>
            ) : (
              results.map((m) => <MessageBubble key={m.id} message={m} isStaff={isStaff} onReply={onReply} />)
            )}
          </div>
        ) : isLoading ? (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-gold" />
          </div>
        ) : messages.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <MessageCircle className="h-8 w-8 text-gold/30" />
            <p className="mt-3 text-sm text-muted-foreground">No messages yet. Say hello!</p>
          </div>
        ) : (
          <>
            <div ref={topRef} />
            {isFetchingNextPage && (
              <div className="grid place-items-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-gold" />
              </div>
            )}
            <div className="space-y-0.5">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} isStaff={isStaff} onReply={onReply} />
              ))}
            </div>
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
}
