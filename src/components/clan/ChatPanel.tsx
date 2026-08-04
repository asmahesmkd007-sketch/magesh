import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Send, Trash2, Reply, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getChatMessages, sendChatMessage, deleteChatMessage, markChatRead } from "@/lib/clanApi";
import { MemberAvatar, PanelEmpty } from "@/components/clan/ClanPrimitives";
import type { ClanChatMessage, ClanRole } from "@/types/clan";
import { getSenderDisplayName } from "@/lib/api/chatClient";
import { UserAvatar } from "@/components/site/UserAvatar";

function relTime(iso?: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

interface Props {
  clanId: string;
  myRole: ClanRole | null;
}

const TYPING_IDLE_MS = 2500;

export function ChatPanel({ clanId, myRole }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ClanChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<ClanChatMessage | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myUsernameRef = useRef<string>("");

  const scrollToBottom = () => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const messageById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  useEffect(() => {
    if (!myRole) return;

    getChatMessages(clanId)
      .then((msgs) => {
        setMessages(msgs);
        scrollToBottom();
      })
      .catch(() => setMessages([]));

    markChatRead(clanId);

    const channel = supabase
      .channel(`clan_chat_${clanId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "clan_messages",
          filter: `clan_id=eq.${clanId}`,
        },
        async (payload) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("username,avatar_url")
            .eq("id", payload.new.sender_id)
            .single();
          setMessages((prev) => [
            ...prev,
            {
              id: payload.new.id,
              sender_id: payload.new.sender_id,
              content: payload.new.content,
              content_type: payload.new.content_type ?? "text",
              reply_to: payload.new.reply_to ?? null,
              created_at: payload.new.created_at,
              profiles: profile,
            },
          ]);
          scrollToBottom();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "clan_messages",
          filter: `clan_id=eq.${clanId}`,
        },
        (payload) => {
          // Deletion is a soft delete (deleted_at set), not a row DELETE.
          if (payload.new.deleted_at) {
            setMessages((prev) => prev.filter((m) => m.id !== payload.new.id));
          }
        },
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const { userId, username } = payload as { userId: string; username: string };
        if (userId === user?.id) return;
        setTypingUsers((prev) => ({ ...prev, [userId]: username }));
        setTimeout(() => {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
          });
        }, TYPING_IDLE_MS);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [clanId, myRole, user?.id]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        myUsernameRef.current = data?.username ?? "Someone";
      });
  }, [user]);

  function notifyTyping() {
    if (!channelRef.current || !user) return;
    if (typingTimeoutRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: user.id, username: myUsernameRef.current },
    });
    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 1200);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || !user || !myRole) return;
    setInput("");
    const pendingReply = replyTo?.id ?? null;
    setReplyTo(null);
    await sendChatMessage(clanId, user.id, content, pendingReply).catch(() => setInput(content));
  }

  async function handleDelete(messageId: string) {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    await deleteChatMessage(messageId).catch(() => {
      // The realtime UPDATE listener will restore state on next load if this failed silently.
    });
  }

  if (!myRole) {
    return (
      <PanelEmpty
        icon={MessageSquare}
        title="Members only"
        hint="Join this clan to view and participate in chat."
      />
    );
  }

  const typingNames = Object.values(typingUsers);

  return (
    <div className="flex h-[600px] flex-col overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02]">
      <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No messages yet. Be the first to say hello!
          </div>
        ) : (
          messages.map((msg, idx) => {
            if (msg.content_type === "system") {
              return (
                <div key={msg.id} className="flex justify-center">
                  <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-muted-foreground">
                    {msg.content}
                  </span>
                </div>
              );
            }
            const isMe = msg.sender_id === user?.id;
            const canDelete = isMe || myRole === "leader" || myRole === "co_leader";
            const quoted = msg.reply_to ? messageById.get(msg.reply_to) : null;
            const displayName = getSenderDisplayName(msg.profiles);
            const isGrouped =
              idx > 0 &&
              messages[idx - 1].sender_id === msg.sender_id &&
              messages[idx - 1].content_type !== "system" &&
              new Date(msg.created_at).getTime() - new Date(messages[idx - 1].created_at).getTime() < 300000;

            return (
              <div
                key={msg.id}
                className={`flex max-w-[85%] gap-2.5 ${isMe ? "ml-auto flex-row-reverse" : ""}`}
              >
                {!isGrouped ? (
                  <UserAvatar
                    displayName={displayName}
                    avatarUrl={msg.profiles?.avatar_url}
                    size="sm"
                    className="shrink-0"
                  />
                ) : (
                  <div className="w-8 shrink-0" />
                )}
                <div className={`group flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  {!isGrouped && (
                    <div className="mb-1 flex items-baseline gap-2 px-1">
                      <span className="text-xs font-semibold text-white">
                        {displayName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {relTime(msg.created_at)}
                      </span>
                    </div>
                  )}
                  {quoted && (
                    <div
                      className={`mb-1 max-w-full truncate rounded-lg border-l-2 border-gold/50 bg-black/20 px-2 py-1 text-[11px] text-muted-foreground ${isMe ? "text-right" : ""}`}
                    >
                      {getSenderDisplayName(quoted.profiles)}:{" "}
                      {quoted.content_type === "system" ? quoted.content : quoted.content}
                    </div>
                  )}
                  <div className={`flex items-center gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                    <div
                      className={`rounded-2xl px-4 py-2 text-sm ${isMe ? "rounded-tr-sm bg-gold text-black font-medium" : "rounded-tl-sm bg-white/10 text-white"}`}
                    >
                      {msg.content}
                    </div>
                    <button
                      onClick={() => setReplyTo(msg)}
                      className="p-1 text-muted-foreground opacity-0 transition-opacity hover:text-gold group-hover:opacity-100"
                      title="Reply"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(msg.id)}
                        className="p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {typingNames.length > 0 && (
        <div className="px-4 pb-1 text-[11px] italic text-muted-foreground">
          {typingNames.slice(0, 3).join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
        </div>
      )}

      {replyTo && (
        <div className="flex items-center justify-between gap-2 border-t border-white/5 bg-black/30 px-4 py-2 text-xs text-muted-foreground">
          <span className="truncate">
            Replying to <span className="text-gold">{replyTo.profiles?.username ?? "message"}</span>
            : {replyTo.content}
          </span>
          <button
            onClick={() => setReplyTo(null)}
            className="shrink-0 rounded-full p-1 hover:bg-white/10 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-white/5 bg-black/20 p-3"
      >
        <input
          className="flex-1 rounded-full border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-gold/50 placeholder:text-muted-foreground"
          placeholder="Send a message to your clan..."
          value={input}
          maxLength={200}
          onChange={(e) => {
            setInput(e.target.value.slice(0, 200));
            notifyTyping();
          }}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold text-black transition-colors hover:bg-gold/90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
