// Box 6 — Room Information slide-over. Opened from the "Info" button in the
// ChannelView header for room channels. Shows full room metadata and the
// owner/member/non-member action set from the redesign spec.
import { useState } from "react";
import { Loader2, Lock, Settings as SettingsIcon, Trash2, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useChatActions } from "@/hooks/useChat";
import type { ChatChannel } from "@/lib/api/chatClient";
import { RoomSettingsModal } from "./RoomSettingsModal";
import { JoinRoomModal } from "./JoinRoomModal";

function fullDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function RoomInfoPanel({ channel, onClose }: { channel: ChatChannel; onClose: () => void }) {
  const { user } = useAuth();
  const actions = useChatActions();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [joining, setJoining] = useState(false);

  const isOwner = channel.owner_id === user?.id;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xs flex-col border-l border-white/10 bg-[#0d0f13]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h3 className="text-sm font-medium">Room information</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/5 text-xl">
              {channel.icon ?? (channel.is_private ? <Lock className="h-5 w-5" /> : "🌐")}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="truncate text-base font-medium">{channel.name}</h4>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                    channel.is_private
                      ? "bg-rose-500/15 text-rose-300"
                      : "bg-emerald/15 text-emerald"
                  }`}
                >
                  {channel.is_private ? "Private" : "Public"}
                </span>
              </div>
              <div className="truncate font-mono text-[11px] text-muted-foreground">
                ID: {channel.room_code ?? channel.slug}
              </div>
            </div>
          </div>

          {channel.description && (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {channel.description}
            </p>
          )}

          <dl className="mt-4 space-y-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Created by</dt>
              <dd className="font-medium">{channel.owner ? `@${channel.owner.username}` : "—"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Created date</dt>
              <dd className="font-medium">{fullDate(channel.created_at)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Room type</dt>
              <dd className="font-medium">{channel.is_private ? "Private room" : "Public room"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Member count</dt>
              <dd className="font-medium">
                {channel.member_count}
                {channel.max_members ? ` / ${channel.max_members}` : ""}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Online members</dt>
              <dd className="font-medium">{channel.online_count}</dd>
            </div>
          </dl>

          <div className="mt-4 space-y-2">
            {isOwner && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gold/30 px-3 py-2 text-xs text-gold hover:bg-gold/10"
                >
                  <SettingsIcon className="h-3.5 w-3.5" /> Edit room
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(`Delete "${channel.name}" permanently? This cannot be undone.`)
                    ) {
                      actions.deleteRoom.mutate(channel.id, {
                        onSuccess: () => {
                          onClose();
                          navigate({ to: "/chat" });
                        },
                      });
                    }
                  }}
                  disabled={actions.deleteRoom.isPending}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
                >
                  {actions.deleteRoom.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Delete room
                </button>
              </>
            )}
            {!isOwner && channel.is_member && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Leave this room?"))
                    actions.leaveRoom.mutate(channel.id, { onSuccess: onClose });
                }}
                disabled={actions.leaveRoom.isPending}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-muted-foreground hover:border-rose-500/30 hover:text-rose-400 disabled:opacity-50"
              >
                {actions.leaveRoom.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Leave room
              </button>
            )}
            {!channel.is_member && (
              <button
                type="button"
                onClick={() => {
                  if (channel.is_private) setJoining(true);
                  else actions.joinRoom.mutate(channel.id);
                }}
                disabled={actions.joinRoom.isPending}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg gradient-gold px-3 py-2 text-xs font-medium text-background disabled:opacity-50"
              >
                {actions.joinRoom.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Join room
              </button>
            )}
          </div>
        </div>
      </div>

      {editing && <RoomSettingsModal channel={channel} onClose={() => setEditing(false)} />}
      {joining && <JoinRoomModal mode="private" onClose={() => setJoining(false)} />}
    </div>
  );
}
