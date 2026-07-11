import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useChatActions } from "@/hooks/useChat";

const ICONS = ["💬", "♟️", "🏆", "🔥", "🎯", "🧠", "⚡", "🌟", "🎓", "🛡️"];

export function CreateRoomModal({ onClose }: { onClose: () => void }) {
  const { createRoom } = useChatActions();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [icon, setIcon] = useState(ICONS[0]);
  const [maxMembers, setMaxMembers] = useState("");
  const [password, setPassword] = useState("");

  const canSubmit = name.trim() && (!isPrivate || password.trim());

  const submit = () => {
    if (!canSubmit) return;
    createRoom.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        isPrivate,
        icon,
        maxMembers: maxMembers.trim() ? Number(maxMembers) : null,
        password: isPrivate ? password.trim() : null,
      },
      {
        onSuccess: (room) => {
          onClose();
          navigate({ to: "/chat/room/$slug", params: { slug: room.slug ?? room.id } });
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#101317] p-5 shadow-luxe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium">Create room</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Room icon</label>
            <div className="flex flex-wrap gap-1.5">
              {ICONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setIcon(e)}
                  className={`grid h-8 w-8 place-items-center rounded-lg border text-base ${
                    icon === e ? "border-gold/60 bg-gold/10" : "border-white/10 hover:border-white/20"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Room name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Najdorf Study Group"
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Maximum members (optional)</label>
            <input
              type="number"
              min={2}
              value={maxMembers}
              onChange={(e) => setMaxMembers(e.target.value)}
              placeholder="No limit"
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
            />
          </div>
          <div className="flex rounded-lg border border-white/10 p-1">
            {(
              [
                [false, "Public"],
                [true, "Private"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setIsPrivate(val)}
                className={`flex-1 rounded-md py-1.5 text-xs ${isPrivate === val ? "bg-gold/15 text-gold" : "text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {isPrivate ? (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Password (required for private rooms)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose a password"
                className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Only people with the Room ID and password can join. Stored securely — never shown in plain text.
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Anyone can find and join this room by name or Room ID.</p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || createRoom.isPending}
            className="flex items-center gap-1.5 rounded-lg gradient-gold px-4 py-1.5 text-xs font-medium text-background disabled:opacity-50"
          >
            {createRoom.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
