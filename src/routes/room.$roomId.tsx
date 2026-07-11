import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Crown,
  Loader2,
  LogOut,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/site/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import {
  leaveRoom,
  startMatch,
  joinRoom,
  joinRoomQueue,
  getRoomQueue,
  type PublicRoom,
  type QueueEntry,
} from "@/lib/api/roomClient";
import { toast } from "sonner";
import { PremiumBadge } from "@/components/site/PremiumBadge";

export const Route = createFileRoute("/room/$roomId")({
  head: () => ({ meta: [{ title: "Waiting Room — ChessOx" }] }),
  component: RoomWaiting,
});

type Profile = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  premium_active?: boolean;
  premium_expires_at?: string | null;
};

type QueueEntryWithProfile = QueueEntry & { profile: Profile | null };

// Bypasses generated types for public_rooms (not in Supabase codegen)
async function fetchRoomById(roomId: string): Promise<PublicRoom | null> {
  const client = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          col: string,
          val: string,
        ) => {
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
  const { data, error } = await client
    .from("public_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
  if (error) {
    console.warn("[fetchRoomById] error:", error);
    return null;
  }
  return (data as PublicRoom) ?? null;
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await (supabase as any)
    .from("profiles")
    .select("id, username, full_name, avatar_url, premium_active, premium_expires_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[fetchProfile] error for", userId, error);
    return null;
  }
  return (data as Profile) ?? null;
}

async function fetchQueueWithProfiles(roomId: string): Promise<QueueEntryWithProfile[]> {
  const entries = await getRoomQueue(roomId);
  if (entries.length === 0) return [];
  const profiles = await Promise.all(entries.map((e) => fetchProfile(e.user_id)));
  return entries.map((e, i) => ({ ...e, profile: profiles[i] }));
}

function PlayerCard({
  profile,
  label,
  isYou,
  isHighlighted,
  empty,
}: {
  profile: Profile | null;
  label: string;
  isYou: boolean;
  isHighlighted: boolean;
  empty?: boolean;
}) {
  return (
    <Card className={`p-6 transition ${isHighlighted ? "ring-1 ring-gold/30" : ""}`}>
      <div className="mb-4 flex items-center gap-1 text-xs uppercase tracking-widest text-gold/60">
        {label === "Host" && <Crown className="h-3 w-3" />}
        {label}
      </div>

      {empty ? (
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-full border-2 border-dashed border-white/10 bg-white/[0.02]" />
          <div>
            <div className="text-sm text-muted-foreground">Waiting for opponent…</div>
            <div className="mt-0.5 text-xs text-gold/50">Share the room code</div>
          </div>
        </div>
      ) : profile ? (
        <div className="flex items-center gap-3">
          <UserAvatar
            avatarUrl={profile.avatar_url}
            displayName={profile.full_name || profile.username}
            size="lg"
            className="shrink-0"
          />
          <div>
            <div className="font-display text-xl flex items-center">
              {profile.full_name ?? profile.username}
              <PremiumBadge
                className="h-4 w-4 ml-2"
                premiumActive={profile.premium_active}
                premiumExpiresAt={profile.premium_expires_at}
              />
            </div>
            <div className="text-sm text-muted-foreground">@{profile.username}</div>
            {isYou && <div className="mt-0.5 text-xs text-gold">You</div>}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 animate-pulse rounded-full bg-white/5" />
          <div className="space-y-2">
            <div className="h-4 w-28 animate-pulse rounded bg-white/5" />
            <div className="h-3 w-20 animate-pulse rounded bg-white/5" />
          </div>
        </div>
      )}
    </Card>
  );
}

function RoomWaiting() {
  const { roomId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [hostProfile, setHostProfile] = useState<Profile | null>(null);
  const [guestProfile, setGuestProfile] = useState<Profile | null>(null);
  const [queueEntries, setQueueEntries] = useState<QueueEntryWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isInQueue, setIsInQueue] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);

  // Track guest ID across realtime events to avoid redundant fetches
  const guestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }

    let cancelled = false;

    async function load() {
      const r = await fetchRoomById(roomId);
      if (cancelled) return;

      if (!r) {
        setError("Room not found.");
        setLoading(false);
        return;
      }

      if (r.status === "closed" || r.status === "finished") {
        setError("This room has been closed.");
        setLoading(false);
        return;
      }

      if (r.status === "playing" && r.game_id) {
        navigate({ to: "/game/$id", params: { id: r.game_id } });
        return;
      }

      // User is neither host nor guest — decide whether to join room or queue
      if (r.host_id !== user!.id && r.guest_id !== user!.id) {
        if (r.status === "waiting") {
          try {
            await joinRoom(roomId);
          } catch (err) {
            if (cancelled) return;
            const msg = err instanceof Error ? err.message : "";
            // "Room is full" is a race condition — fall through to queue logic below
            if (msg && !msg.includes("Room is full")) {
              setError(msg);
              setLoading(false);
              return;
            }
          }
        }

        if (cancelled) return;

        // Re-fetch authoritative state after join attempt
        const refreshed = await fetchRoomById(roomId);
        if (cancelled) return;
        if (!refreshed) {
          setError("Room not found.");
          setLoading(false);
          return;
        }

        // Still not in the room as guest — join the queue
        if (refreshed.guest_id !== user!.id && refreshed.host_id !== user!.id) {
          if (refreshed.status !== "waiting" && refreshed.status !== "guest_joined") {
            setError("Room is not accepting players.");
            setLoading(false);
            return;
          }
          try {
            const pos = await joinRoomQueue(roomId);
            if (!cancelled) {
              setIsInQueue(true);
              setQueuePosition(pos);
              toast.info(`You are #${pos} in the waiting queue.`);
            }
          } catch (queueErr) {
            if (!cancelled) {
              setError(queueErr instanceof Error ? queueErr.message : "Could not join queue");
              setLoading(false);
              return;
            }
          }
        }
      }

      if (cancelled) return;

      // Fetch current room, all profiles and queue in one parallel pass
      const currentRoom = await fetchRoomById(roomId);
      if (cancelled || !currentRoom) return;

      const [hp, gp, queue] = await Promise.all([
        fetchProfile(currentRoom.host_id),
        currentRoom.guest_id ? fetchProfile(currentRoom.guest_id) : Promise.resolve(null),
        fetchQueueWithProfiles(roomId),
      ]);

      if (!cancelled) {
        setRoom(currentRoom);
        guestIdRef.current = currentRoom.guest_id;
        setHostProfile(hp);
        setGuestProfile(gp);
        setQueueEntries(queue);

        // Sync queue status for the current user
        const myEntry = queue.find((e) => e.user_id === user!.id);
        if (myEntry) {
          setIsInQueue(true);
          setQueuePosition(myEntry.position);
        }

        setLoading(false);
      }
    }

    load();

    // Realtime — watch public_rooms for status / guest changes
    const roomChannel = supabase
      .channel(`room_watch:${roomId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "public_rooms", filter: `id=eq.${roomId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (payload: any) => {
          if (cancelled) return;

          if (payload.eventType === "DELETE") {
            toast.error("Room was deleted.");
            navigate({ to: "/room" });
            return;
          }

          const updated = payload.new as PublicRoom;
          setRoom(updated);

          if (updated.status === "playing" && updated.game_id) {
            navigate({ to: "/game/$id", params: { id: updated.game_id } });
            return;
          }

          if (updated.status === "closed") {
            toast.error("The host closed the room.");
            navigate({ to: "/room" });
            return;
          }

          // New guest joined (or current user was promoted from queue)
          if (updated.guest_id && updated.guest_id !== guestIdRef.current) {
            guestIdRef.current = updated.guest_id;
            const gp = await fetchProfile(updated.guest_id);
            if (!cancelled) {
              setGuestProfile(gp);
              if (updated.guest_id === user!.id) {
                setIsInQueue(false);
                setQueuePosition(null);
                toast.success("You have been promoted — waiting for the host to start.");
              }
            }
          }

          // Guest left — clear profile
          if (!updated.guest_id && guestIdRef.current) {
            guestIdRef.current = null;
            setGuestProfile(null);
          }
        },
      )
      .subscribe();

    // Realtime — watch room_queue for queue position changes
    const queueChannel = supabase
      .channel(`queue_watch:${roomId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "room_queue", filter: `room_id=eq.${roomId}` },
        async () => {
          if (cancelled) return;
          const queue = await fetchQueueWithProfiles(roomId);
          if (!cancelled) {
            setQueueEntries(queue);
            const myEntry = queue.find((e) => e.user_id === user!.id);
            if (myEntry) {
              setIsInQueue(true);
              setQueuePosition(myEntry.position);
            } else {
              setIsInQueue(false);
              setQueuePosition(null);
            }
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(queueChannel);
    };
  }, [roomId, user?.id, authLoading]);

  async function handleStart() {
    if (!room) return;
    setStarting(true);
    try {
      const gameId = await startMatch(roomId);
      navigate({ to: "/game/$id", params: { id: gameId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start match");
      setStarting(false);
    }
  }

  async function handleLeave() {
    setLeaving(true);
    try {
      await leaveRoom(roomId);
    } catch {
      // ignore — navigate regardless
    }
    navigate({ to: "/room" });
  }

  function handleCopy() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    navigator.clipboard.writeText(`${origin}/room/${roomId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (authLoading || loading) {
    return (
      <PageShell eyebrow="The Court" title="Waiting Room">
        <div className="grid place-items-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell eyebrow="The Court" title="Waiting Room">
        <Card className="p-10 text-center">
          <WifiOff className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">{error}</p>
          <div className="mt-6">
            <Link to="/room">
              <GoldButton>Back to Rooms</GoldButton>
            </Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  if (!room || !user) return null;

  const isHost = room.host_id === user.id;
  const isGuest = room.guest_id === user.id;
  const hasGuest = room.guest_id !== null;
  const inviteUrl =
    typeof window !== "undefined" ? `${window.location.origin}/room/${roomId}` : `/room/${roomId}`;

  const colorLabel =
    room.color_mode === "random"
      ? "Random colors"
      : room.color_mode === "host_white"
        ? "Host plays White"
        : "Host plays Black";

  return (
    <PageShell eyebrow="The Court" title="Waiting Room">
      {/* Top bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/room"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Public Rooms
        </Link>
        <div className="flex items-center gap-1.5 text-xs">
          {hasGuest ? (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald animate-pulse" />
              <span className="text-emerald">Both players connected</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-gold/60 animate-pulse" />
              <span className="text-muted-foreground">Waiting for opponent</span>
            </>
          )}
        </div>
      </div>

      {/* Room code hero */}
      <Card className="relative mb-6 overflow-hidden p-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-gold/8 via-transparent to-transparent" />
        <div className="pointer-events-none absolute inset-0 mandala-bg opacity-10" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-gold/70">Room Code</div>
            <div className="mt-1 font-display text-4xl tracking-[0.2em] text-gradient-gold">
              {roomId}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <code className="hidden rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 font-mono text-xs text-muted-foreground sm:block">
              {inviteUrl}
            </code>
            <button
              onClick={handleCopy}
              title={copied ? "Copied!" : "Copy invite link"}
              className="grid h-9 w-9 place-items-center rounded-xl border border-gold/25 bg-gold/5 transition hover:bg-gold/10"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald" />
              ) : (
                <Copy className="h-4 w-4 text-gold" />
              )}
            </button>
          </div>
        </div>
      </Card>

      {/* Queue position banner — shown only to users waiting in queue */}
      {isInQueue && !isGuest && (
        <Card className="mb-6 flex items-center gap-3 border-gold/20 bg-gold/5 p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl gradient-gold text-background font-display text-lg">
            {queuePosition}
          </div>
          <div>
            <div className="font-display text-base text-gold">You are in the waiting queue</div>
            <div className="text-xs text-muted-foreground">
              You will be promoted automatically when the current opponent leaves.
            </div>
          </div>
        </Card>
      )}

      {/* Player slots */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <PlayerCard profile={hostProfile} label="Host" isYou={isHost} isHighlighted={isHost} />
        <PlayerCard
          profile={hasGuest ? guestProfile : null}
          label="Opponent"
          isYou={isGuest}
          isHighlighted={isGuest}
          empty={!hasGuest}
        />
      </div>

      {/* Room settings */}
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-gold" />
            {room.time_control} ·{" "}
            {room.time_class.charAt(0).toUpperCase() + room.time_class.slice(1)}
          </span>
          <span>{room.is_rated ? "Rated" : "Unrated"}</span>
          <span>{colorLabel}</span>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {isHost ? (
          <GoldButton onClick={handleStart} disabled={!hasGuest || starting}>
            {starting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Starting…
              </>
            ) : hasGuest ? (
              <>
                <Crown className="h-4 w-4" /> Start Game
              </>
            ) : (
              "Waiting for opponent…"
            )}
          </GoldButton>
        ) : isGuest ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald/20 bg-emerald/5 px-4 py-2 text-sm text-emerald">
            <Wifi className="h-4 w-4" />
            Connected · Waiting for host to start
          </div>
        ) : null}

        <GhostButton onClick={handleLeave} disabled={leaving}>
          <LogOut className="h-4 w-4" />
          {leaving ? "Leaving…" : "Leave Room"}
        </GhostButton>
      </div>

      {/* Waiting Queue */}
      {queueEntries.length > 0 && (
        <Card className="mt-6 p-5">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-gold/60">
            <Users className="h-3.5 w-3.5" />
            Also Waiting ({queueEntries.length})
          </div>
          <div className="space-y-2">
            {queueEntries.map((entry) => {
              const isMe = entry.user_id === user.id;
              const name = entry.profile?.full_name || entry.profile?.username || "User";
              return (
                <div
                  key={entry.user_id}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                    isMe ? "bg-gold/5 ring-1 ring-gold/20" : "bg-white/[0.02]"
                  }`}
                >
                  <span className="w-5 shrink-0 text-center text-xs font-medium text-muted-foreground">
                    #{entry.position}
                  </span>
                  <UserAvatar
                    avatarUrl={entry.profile?.avatar_url}
                    displayName={entry.profile ? name : "?"}
                    size="sm"
                    className="shrink-0"
                  />
                  <span className="text-sm flex items-center">
                    {name}
                    <PremiumBadge
                      premiumActive={entry.profile?.premium_active}
                      premiumExpiresAt={entry.profile?.premium_expires_at}
                    />
                  </span>
                  {isMe && <span className="ml-auto text-xs text-gold">You</span>}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </PageShell>
  );
}
