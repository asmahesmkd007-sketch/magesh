// Message composer: plain text input + reply preview banner. Deliberately
// text-only (no attachments) per spec — emoji reactions live on the
// message itself, not the composer.
import { useRef, useState } from "react";
import { Loader2, Send, SmilePlus, X } from "lucide-react";
import { useChatActions, useTypingIndicator } from "@/hooks/useChat";
import type { ChatMessage } from "@/lib/api/chatClient";
import { EmojiPicker } from "./EmojiPicker";

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
  const { sendTyping } = useTypingIndicator(channelId);
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingSent = useRef(0);

  if (!user) {
    return (
      <div className="shrink-0 border-t border-white/10 p-4 text-center text-xs text-muted-foreground">
        Sign in to join the conversation.
      </div>
    );
  }

  const submit = () => {
    const content = text.trim().slice(0, 200);
    if (!content || send.isPending) return;
    setText("");
    onClearReply();
    send.mutate(
      { channelId, content, replyToId: replyTo?.id ?? null },
      {
        onError: () => {
          setText(content);
        },
      },
    );
  };

  return (
    /* shrink-0 pins the composer to the bottom of the conversation column.
       As a plain flex child it shrinks along with everything else once the
       column is shorter than its content — which is every phone. */
    <div className="shrink-0 border-t border-white/10 p-3">
      {replyTo && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs">
          <span className="truncate text-muted-foreground">
            Replying to <span className="text-gold">{replyTo.author.full_name}</span>:{" "}
            {replyTo.content}
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
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-white/[0.05] hover:text-gold"
              aria-label="Emoji"
            >
              <SmilePlus className="h-4 w-4" />
            </button>
            {pickerOpen && (
              <EmojiPicker
                align="left"
                position="top"
                onPick={(emoji) => {
                  setText((t) => t + emoji);
                  setPickerOpen(false);
                  inputRef.current?.focus();
                }}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </div>
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => {
                const val = e.target.value;
                if (val.length <= 200) {
                  setText(val);
                } else {
                  setText(val.slice(0, 200));
                }
                const now = Date.now();
                if (user && now - lastTypingSent.current > 2000) {
                  lastTypingSent.current = now;
                  sendTyping((user.user_metadata?.full_name as string) || user.email || "Someone");
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (e.repeat || e.nativeEvent.isComposing) return;
                  submit();
                }
              }}
              placeholder="Message…"
              rows={1}
              maxLength={200}
              /* text-base below sm: iOS Safari auto-zooms on focus when a
                 field is under 16px, scaling the layout viewport and pushing
                 the composer off screen the moment you tap it. */
              className="max-h-32 w-full resize-none rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-base outline-none placeholder:text-muted-foreground focus:border-gold/40 sm:text-sm"
            />
            {text.length > 140 && (
              <span
                className={`absolute right-3 bottom-2 text-[10px] font-mono ${
                  text.length >= 200 ? "text-red-400 font-bold" : "text-gold/70"
                }`}
              >
                {text.length}/200
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || send.isPending}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl gradient-gold text-background disabled:opacity-40"
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
