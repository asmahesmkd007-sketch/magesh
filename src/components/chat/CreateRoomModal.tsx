// Create-room modal, shared by all three entry points:
//  - Public Rooms tab  → mode="public"  (Room ID + name + description, no password)
//  - Private Rooms tab → mode="private" (Room ID + name + description + password/confirm)
//  - Bottom "Create room" shortcut → mode=undefined (public/private toggle, original flow)
// Public and Private each get their own fixed-purpose modal presentation (title, fields,
// validation) even though they share this implementation — see chat sidebar spec.
import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useChatActions } from "@/hooks/useChat";
import { isRoomIdAvailable } from "@/lib/api/chatClient";

const ICONS = ["💬", "♟️", "🏆", "🔥", "🎯", "🧠", "⚡", "🌟", "🎓", "🛡️"];

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 32);
}

export function CreateRoomModal({
  onClose,
  mode,
}: {
  onClose: () => void;
  mode?: "public" | "private";
}) {
  const { createRoom } = useChatActions();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [roomIdTouched, setRoomIdTouched] = useState(false);
  const [roomIdStatus, setRoomIdStatus] = useState<"idle" | "checking" | "available" | "taken">(
    "idle",
  );
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(mode === "private");
  const [icon, setIcon] = useState(ICONS[0]);
  const [maxMembers, setMaxMembers] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-suggest a Room ID from the name until the user edits it directly.
  useEffect(() => {
    if (!roomIdTouched) setRoomId(slugify(name));
  }, [name, roomIdTouched]);

  useEffect(() => {
    if (!roomId.trim()) {
      setRoomIdStatus("idle");
      return;
    }
    setRoomIdStatus("checking");
    if (checkTimer.current) clearTimeout(checkTimer.current);
    checkTimer.current = setTimeout(async () => {
      const available = await isRoomIdAvailable(roomId.trim());
      setRoomIdStatus(available ? "available" : "taken");
    }, 350);
    return () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
  }, [roomId]);

  const passwordOk =
    mode === "private" || isPrivate
      ? password.trim().length > 0 && password === confirmPassword
      : true;
  const canSubmit =
    name.trim().length > 0 &&
    roomId.trim().length > 0 &&
    roomIdStatus !== "taken" &&
    roomIdStatus !== "checking" &&
    passwordOk;

  const submit = () => {
    if (!canSubmit) return;
    createRoom.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        isPrivate: mode ? mode === "private" : isPrivate,
        icon,
        maxMembers: maxMembers.trim() ? Number(maxMembers) : null,
        password: (mode ? mode === "private" : isPrivate) ? password.trim() : null,
        roomId: roomId.trim(),
      },
      {
        onSuccess: (room) => {
          onClose();
          navigate({ to: "/chat/room/$slug", params: { slug: room.slug ?? room.id } });
        },
      },
    );
  };

  const showPrivateFields = mode ? mode === "private" : isPrivate;
  const title =
    mode === "public"
      ? "Create public room"
      : mode === "private"
        ? "Create private room"
        : "Create room";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#101317] p-5 shadow-luxe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium">{title}</h3>
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
                    icon === e
                      ? "border-gold/60 bg-gold/10"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Room name *</label>
            <input
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              data-lpignore="true"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Najdorf Study Group"
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Room ID *</label>
            <input
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              data-lpignore="true"
              value={roomId}
              onChange={(e) => {
                setRoomIdTouched(true);
                setRoomId(slugify(e.target.value));
              }}
              maxLength={32}
              placeholder="najdorf-study-group"
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 font-mono text-sm outline-none focus:border-gold/40"
            />
            <p className="mt-1 text-[11px]">
              {roomIdStatus === "checking" && (
                <span className="text-muted-foreground">Checking availability…</span>
              )}
              {roomIdStatus === "available" && (
                <span className="text-emerald">Room ID is available</span>
              )}
              {roomIdStatus === "taken" && (
                <span className="text-rose-400">This Room ID is already taken</span>
              )}
              {roomIdStatus === "idle" && (
                <span className="text-muted-foreground">
                  Others use this to find and join your room.
                </span>
              )}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Maximum members (optional)
            </label>
            <input
              type="number"
              min={2}
              value={maxMembers}
              onChange={(e) => setMaxMembers(e.target.value)}
              placeholder="No limit"
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
            />
          </div>
          {!mode && (
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
          )}
          {showPrivateFields ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Password *</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Choose a password"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Confirm password *
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
                />
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <p className="mt-1 text-[11px] text-rose-400">Passwords do not match</p>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Only people with the Room ID and password can join. Stored securely — never shown in
                plain text.
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Anyone can find and join this room by name or Room ID.
            </p>
          )}
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
