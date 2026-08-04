// Join-room modal — the counterpart to CreateRoomModal for the "🔍 Join Room"
// button on the Public and Private Rooms tabs. Public rooms only need a Room
// ID; private rooms also require the room's password (verified server-side).
import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useChatActions } from "@/hooks/useChat";

export function JoinRoomModal({
  onClose,
  mode,
}: {
  onClose: () => void;
  mode: "public" | "private";
}) {
  const { joinPublicRoomBySlug, joinPrivateRoom } = useChatActions();
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pending = mode === "private" ? joinPrivateRoom.isPending : joinPublicRoomBySlug.isPending;
  const canSubmit = roomId.trim().length > 0 && (mode === "public" || password.trim().length > 0);

  const submit = () => {
    setError(null);
    if (mode === "private") {
      joinPrivateRoom.mutate(
        { roomCode: roomId.trim(), password: password.trim() },
        {
          onSuccess: (room) => {
            onClose();
            navigate({ to: "/chat/room/$slug", params: { slug: room.slug ?? room.id } });
          },
          onError: (e) =>
            setError(
              e instanceof Error && /password/i.test(e.message)
                ? "Invalid Password"
                : e instanceof Error
                  ? e.message
                  : "Invalid Password",
            ),
        },
      );
    } else {
      joinPublicRoomBySlug.mutate(roomId.trim(), {
        onSuccess: () => {
          onClose();
          navigate({ to: "/chat/room/$slug", params: { slug: roomId.trim() } });
        },
        onError: (e) => setError(e instanceof Error ? e.message : "Room not found"),
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#101317] p-5 shadow-luxe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium">
            {mode === "private" ? "Join private room" : "Join room"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Room ID</label>
            <input
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                setError(null);
              }}
              placeholder="najdorf-study-group"
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 font-mono text-sm outline-none focus:border-gold/40"
              onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
            />
          </div>
          {mode === "private" && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Password</label>
              <input
                type="password"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                data-lpignore="true"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="Room password"
                className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
                onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
              />
            </div>
          )}
          {error && <p className="text-[11px] text-rose-400">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || pending}
            className="flex items-center gap-1.5 rounded-lg gradient-gold px-4 py-1.5 text-xs font-medium text-background disabled:opacity-50"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Join
          </button>
        </div>
      </div>
    </div>
  );
}
