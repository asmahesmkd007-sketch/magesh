import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Trash2, X } from "lucide-react";
import { useChatActions } from "@/hooks/useChat";
import type { ChatChannel } from "@/lib/api/chatClient";

export function RoomSettingsModal({
  channel,
  onClose,
}: {
  channel: ChatChannel;
  onClose: () => void;
}) {
  const { updateRoom, deleteRoom } = useChatActions();
  const navigate = useNavigate();
  const [name, setName] = useState(channel.name ?? "");
  const [description, setDescription] = useState(channel.description ?? "");

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-[#101317] p-5 shadow-luxe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium">Room settings</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Room name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
            />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete "${channel.name}" permanently? This cannot be undone.`)) {
                deleteRoom.mutate(channel.id, { onSuccess: () => navigate({ to: "/chat" }) });
              }
            }}
            className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete room
          </button>
          <button
            type="button"
            disabled={!name.trim() || updateRoom.isPending}
            onClick={() =>
              updateRoom.mutate(
                { channelId: channel.id, name: name.trim(), description: description.trim() },
                { onSuccess: onClose },
              )
            }
            className="flex items-center gap-1.5 rounded-lg gradient-gold px-4 py-1.5 text-xs font-medium text-background disabled:opacity-50"
          >
            {updateRoom.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
