// Message composer: plain text input + reply preview banner. Deliberately
// text-only (no attachments) per spec — emoji reactions live on the
// message itself, not the composer.
import { useRef, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { useChatActions } from "@/hooks/useChat";
import type { ChatMessage } from "@/lib/api/chatClient";

export function Composer({
  channelId,
  replyTo,
  onClearReply,
  disabledReason,
}: {
  channelId: string;
  replyTo: ChatMessage | null;
  onClearReply: () => void;
  disabledReason?: string | null;
}) {
  const { send, user } = useChatActions();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  if (!user) {
    return (
      <div className="border-t border-white/10 p-4 text-center text-xs text-muted-foreground">
        Sign in to join the conversation.
      </div>
    );
  }

  const submit = () => {
    const content = text.trim();
    if (!content) return;
    send.mutate(
      { channelId, content, replyToId: replyTo?.id ?? null },
      {
        onSuccess: () => {
          setText("");
          onClearReply();
        },
      },
    );
  };

  return (
    <div className="border-t border-white/10 p-3">
      {replyTo && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs">
          <span className="truncate text-muted-foreground">
            Replying to <span className="text-gold">{replyTo.author.display_name}</span>: {replyTo.content}
          </span>
          <button type="button" onClick={onClearReply} aria-label="Cancel reply">
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
      )}
      {disabledReason ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-xs text-muted-foreground">
          {disabledReason}
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Message…"
            rows={1}
            maxLength={2000}
            className="max-h-32 flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-gold/40"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || send.isPending}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl gradient-gold text-background disabled:opacity-40"
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
