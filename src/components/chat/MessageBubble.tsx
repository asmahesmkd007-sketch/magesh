// Single chat message: avatar, author, content with @mention highlighting,
// reactions, reply preview, and a hover action row (react/reply/copy/pin/
// delete/report) that stays minimal per the "keep it clean" spec.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, Flag, MoreHorizontal, Pin, PinOff, Reply, SmilePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/site/UserAvatar";
import { FriendButton } from "@/components/friends/FriendButton";
import { useAuth } from "@/hooks/useAuth";
import { useChatActions } from "@/hooks/useChat";
import type { ChatMessage } from "@/lib/api/chatClient";
import { EmojiPicker } from "./EmojiPicker";
import { ReportDialog } from "./ReportDialog";

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function RichContent({ text }: { text: string }) {
  const parts = text.split(/(@[A-Za-z0-9_]{2,32})/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <Link
            key={i}
            to="/u/$username"
            params={{ username: part.slice(1) }}
            className="text-gold hover:underline"
          >
            {part}
          </Link>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

export function MessageBubble({
  message,
  isStaff,
  onReply,
}: {
  message: ChatMessage;
  isStaff: boolean;
  onReply: (msg: ChatMessage) => void;
}) {
  const { user } = useAuth();
  const actions = useChatActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const isOwn = user?.id === message.user_id;

  return (
    <div className="group flex gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/[0.03]">
      <Link to="/u/$username" params={{ username: message.author.username }} className="shrink-0">
        <UserAvatar
          avatarUrl={message.author.avatar_url}
          displayName={message.author.full_name}
          size="sm"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <Link
            to="/u/$username"
            params={{ username: message.author.username }}
            className="text-sm font-medium hover:underline"
          >
            {message.author.full_name}
          </Link>
          <span className="text-[11px] text-muted-foreground">{relTime(message.created_at)}</span>
          {message.is_pinned && <Pin className="h-3 w-3 text-gold" />}
          {!isOwn && (
            <FriendButton
              targetUserId={message.user_id}
              targetName={message.author.full_name}
              className="h-5 w-5"
              compact
            />
          )}
        </div>
        {message.reply_to && (
          <div className="mt-0.5 truncate border-l-2 border-gold/30 pl-2 text-xs text-muted-foreground">
            {message.reply_to.author_name}: {message.reply_to.content}
          </div>
        )}
        <div className="mt-0.5 text-[15px] leading-snug">
          <RichContent text={message.content} />
        </div>
        {message.reactions && message.reactions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => actions.react.mutate({ messageId: message.id, emoji: r.emoji })}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${
                  r.mine
                    ? "border-gold/50 bg-gold/10 text-gold"
                    : "border-white/10 text-muted-foreground hover:border-white/20"
                }`}
              >
                <span>{r.emoji}</span>
                <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* hover actions */}
      <div className="relative flex shrink-0 items-start gap-0.5 opacity-0 group-hover:opacity-100">
        <div className="relative">
          <button
            type="button"
            title="React"
            onClick={() => setPickerOpen((o) => !o)}
            className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.05] hover:text-gold"
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
          {pickerOpen && (
            <EmojiPicker
              onPick={(emoji) => {
                actions.react.mutate({ messageId: message.id, emoji });
                setPickerOpen(false);
              }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
        <button
          type="button"
          title="Reply"
          onClick={() => onReply(message)}
          className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.05] hover:text-gold"
        >
          <Reply className="h-3.5 w-3.5" />
        </button>
        <div className="relative">
          <button
            type="button"
            title="More"
            onClick={() => setMenuOpen((o) => !o)}
            className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.05] hover:text-gold"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#101317] py-1 shadow-luxe"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                onClick={() => {
                  navigator.clipboard.writeText(message.content);
                  toast.success("Copied");
                  setMenuOpen(false);
                }}
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
              {isStaff && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                  onClick={() => {
                    actions.pin.mutate({
                      messageId: message.id,
                      pinned: !message.is_pinned,
                      channelId: message.channel_id,
                    });
                    setMenuOpen(false);
                  }}
                >
                  {message.is_pinned ? (
                    <PinOff className="h-3.5 w-3.5" />
                  ) : (
                    <Pin className="h-3.5 w-3.5" />
                  )}
                  {message.is_pinned ? "Unpin" : "Pin"}
                </button>
              )}
              {(isOwn || isStaff) && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs text-rose-400 hover:bg-white/[0.05]"
                  onClick={() => {
                    if (window.confirm("Delete this message?")) actions.remove.mutate(message.id);
                    setMenuOpen(false);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
              {!isOwn && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs text-rose-400 hover:bg-white/[0.05]"
                  onClick={() => {
                    setReporting(true);
                    setMenuOpen(false);
                  }}
                >
                  <Flag className="h-3.5 w-3.5" /> Report
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {reporting && (
        <ReportDialog
          onClose={() => setReporting(false)}
          onSubmit={(reason, details) => {
            actions.report.mutate({ messageId: message.id, reason, details });
            setReporting(false);
          }}
        />
      )}
    </div>
  );
}
