import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { Card } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ChatMessage {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profiles?: {
    username: string;
    avatar_url: string | null;
  } | null;
}

interface Props {
  clanId: string;
  myRole: "leader" | "co_leader" | "member" | null;
}

export function ClanChatTab({ clanId, myRole }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial fetch
    supabase
      .from("clan_messages")
      .select("id,sender_id,content,created_at,profiles(username,avatar_url)")
      .eq("clan_id", clanId)
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (data) setMessages(data as unknown as ChatMessage[]);
        scrollToBottom();
      });

    // Realtime subscription
    const sub = supabase
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

          const newMessage: ChatMessage = {
            id: payload.new.id,
            sender_id: payload.new.sender_id,
            content: payload.new.content,
            created_at: payload.new.created_at,
            profiles: profile,
          };
          setMessages((prev) => [...prev, newMessage]);
          scrollToBottom();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "clan_messages",
          filter: `clan_id=eq.${clanId}`,
        },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [clanId]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !user || !myRole) return;

    const content = input.trim();
    setInput("");

    await supabase.from("clan_messages").insert({
      clan_id: clanId,
      sender_id: user.id,
      content,
    });
  }

  async function deleteMessage(id: string) {
    await supabase.from("clan_messages").delete().eq("id", id);
  }

  if (!myRole) {
    return (
      <Card className="p-10 text-center flex flex-col items-center justify-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground">You must join this clan to view and participate in chat.</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-[600px] overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No messages yet. Be the first to say hello!
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === user?.id;
            const canDelete = isMe || myRole === "leader" || myRole === "co_leader";

            return (
              <div key={msg.id} className={`flex gap-3 max-w-[80%] ${isMe ? "ml-auto flex-row-reverse" : ""}`}>
                {!isMe && (
                  <div className="h-8 w-8 rounded-full bg-white/10 shrink-0 grid place-items-center font-display text-sm text-gold">
                    {msg.profiles?.username?.[0]?.toUpperCase()}
                  </div>
                )}
                <div className={`group flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  {!isMe && <span className="text-xs text-muted-foreground ml-1 mb-1">{msg.profiles?.username}</span>}
                  <div className="flex items-center gap-2">
                    {canDelete && isMe && (
                      <button onClick={() => deleteMessage(msg.id)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <div className={`px-4 py-2 rounded-2xl text-sm ${isMe ? "bg-gold text-black rounded-tr-sm" : "bg-white/10 text-white rounded-tl-sm"}`}>
                      {msg.content}
                    </div>
                    {canDelete && !isMe && (
                      <button onClick={() => deleteMessage(msg.id)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-3 border-t border-white/5 bg-black/20">
        <form onSubmit={sendMessage} className="flex items-center gap-2">
          <input
            className="flex-1 rounded-full border border-white/10 bg-black/40 px-4 py-2.5 text-sm outline-none focus:border-gold/50 transition-colors"
            placeholder="Send a message to your clan..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="h-10 w-10 rounded-full bg-gold grid place-items-center text-black disabled:opacity-50 hover:bg-gold/90 transition-colors shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </Card>
  );
}
