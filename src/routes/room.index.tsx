import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { ArrowLeft, Hash, Users, LogIn, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { createRoom, joinRoom, joinRoomQueue, type ColorMode } from "@/lib/api/roomClient";
import { toast } from "sonner";

export const Route = createFileRoute("/room/")({
  head: () => ({ meta: [{ title: "Public Room — ChessOx" }] }),
  component: Room,
});

type TimeEntry = {
  label: string;
  tc: string;
  class: string;
  sec: number;
  inc: number;
};

const TIME_CONTROLS: TimeEntry[] = [
  { label: "1+0 Bullet", tc: "1+0", class: "bullet", sec: 60, inc: 0 },
  { label: "2+1 Bullet", tc: "2+1", class: "bullet", sec: 120, inc: 1 },
  { label: "3+0 Blitz", tc: "3+0", class: "blitz", sec: 180, inc: 0 },
  { label: "5+0 Blitz", tc: "5+0", class: "blitz", sec: 300, inc: 0 },
  { label: "5+3 Blitz", tc: "5+3", class: "blitz", sec: 300, inc: 3 },
  { label: "10+0 Rapid", tc: "10+0", class: "rapid", sec: 600, inc: 0 },
  { label: "10+5 Rapid", tc: "10+5", class: "rapid", sec: 600, inc: 5 },
  { label: "15+10 Rapid", tc: "15+10", class: "rapid", sec: 900, inc: 10 },
  { label: "30+0 Classical", tc: "30+0", class: "classical", sec: 1800, inc: 0 },
];

const COLOR_OPTS: { value: ColorMode; label: string }[] = [
  { value: "random", label: "Random" },
  { value: "host_white", label: "I'm White" },
  { value: "host_black", label: "I'm Black" },
];

function Room() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Create-room state
  const [tcIdx, setTcIdx] = useState(5); // default 10+0 Rapid
  const [colorMode, setColorMode] = useState<ColorMode>("random");
  const [isRated, setIsRated] = useState(true);
  const [creating, setCreating] = useState(false);

  // Join-room state
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  // Active room state
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    async function checkActiveRoom() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("public_rooms")
        .select("id")
        .eq("host_id", user!.id)
        .in("status", ["waiting", "guest_joined", "starting"])
        .single();
      if (data) setActiveRoomId(data.id as string);
    }
    checkActiveRoom();
  }, [user]);

  async function handleCreate() {
    if (!user) {
      toast.error("Sign in to create a room");
      return;
    }
    const tc = TIME_CONTROLS[tcIdx];
    setCreating(true);
    try {
      const roomId = await createRoom({
        timeControl: tc.tc,
        timeClass: tc.class,
        initialSeconds: tc.sec,
        incrementSeconds: tc.inc,
        colorMode,
        isRated,
      });
      navigate({ to: "/room/$roomId", params: { roomId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    if (!user) {
      toast.error("Sign in to join a room");
      return;
    }
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      toast.error("Enter a valid 6-character room code");
      return;
    }
    setJoining(true);
    try {
      await joinRoom(code);
      navigate({ to: "/room/$roomId", params: { roomId: code } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not join room";
      if (msg.includes("Room is full") || msg.includes("Room is not accepting players")) {
        // Room already has a guest — join the waiting queue and navigate to the room page
        try {
          await joinRoomQueue(code);
          navigate({ to: "/room/$roomId", params: { roomId: code } });
        } catch (queueErr) {
          toast.error(queueErr instanceof Error ? queueErr.message : "Could not join queue");
        }
      } else {
        toast.error(msg);
      }
    } finally {
      setJoining(false);
    }
  }

  // Smart input: strips a pasted invite URL down to the 6-char code
  function handleCodeInput(raw: string) {
    const stripped = raw
      .replace(/^.*\/room\//i, "")
      .replace(/[^A-F0-9]/gi, "")
      .toUpperCase();
    setJoinCode(stripped.slice(0, 6));
  }

  if (authLoading) return null;

  if (!user) {
    return (
      <PageShell
        eyebrow="The Court"
        title="Public Room"
        subtitle="Create or join a private room and play with a friend."
      >
        <div className="mb-6">
          <Link
            to="/play"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Play
          </Link>
        </div>
        <Card className="p-10 text-center">
          <Users className="mx-auto h-12 w-12 text-gold/40" />
          <p className="mt-4 text-muted-foreground">Sign in to create or join a room.</p>
          <div className="mt-6">
            <Link to="/auth">
              <GoldButton>
                <LogIn className="h-4 w-4" /> Sign In
              </GoldButton>
            </Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="The Court"
      title="Public Room"
      subtitle="Set up a private room and invite a friend to battle for the throne."
    >
      {/* Back link */}
      <div className="mb-6">
        <Link
          to="/play"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Play
        </Link>
      </div>

      {activeRoomId && (
        <Card className="mb-6 p-5 border-gold/30 bg-gold/5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gold/20 text-gold">
              <Hash className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-lg text-gold">You have an active room</div>
              <div className="text-xs text-muted-foreground">Room Code: {activeRoomId}</div>
            </div>
          </div>
          <Link to="/room/$roomId" params={{ roomId: activeRoomId }}>
            <GoldButton>Rejoin Room</GoldButton>
          </Link>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Create Room ── */}
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl gradient-gold text-background">
              <Hash className="h-5 w-5" />
            </span>
            <div>
              <div className="font-display text-xl">Create Room</div>
              <div className="text-xs text-muted-foreground">Set up and share the invite code</div>
            </div>
          </div>

          {/* Time control */}
          <div className="text-xs uppercase tracking-[0.22em] text-gold/80">Time Control</div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {TIME_CONTROLS.map((t, i) => (
              <button
                key={t.tc}
                onClick={() => setTcIdx(i)}
                className={`rounded-xl border px-2 py-1.5 text-xs transition ${
                  i === tcIdx
                    ? "border-gold bg-gold/10 text-gold"
                    : "border-white/10 text-muted-foreground hover:border-gold/30 hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Colors */}
          <div className="mt-5 text-xs uppercase tracking-[0.22em] text-gold/80">Colors</div>
          <div className="mt-2 flex gap-2">
            {COLOR_OPTS.map((c) => (
              <button
                key={c.value}
                onClick={() => setColorMode(c.value)}
                className={`flex-1 rounded-xl border py-2 text-xs transition ${
                  colorMode === c.value
                    ? "border-gold bg-gold/10 text-gold"
                    : "border-white/10 text-muted-foreground hover:border-gold/30"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Rated toggle */}
          <label className="mt-4 flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={isRated}
              onChange={(e) => setIsRated(e.target.checked)}
              className="h-4 w-4 accent-[#D4AF37]"
            />
            <span className="text-sm">Rated match — affects your Elo</span>
          </label>

          <div className="mt-6">
            <GoldButton className="w-full" onClick={handleCreate} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                </>
              ) : (
                "Create Room"
              )}
            </GoldButton>
          </div>
        </Card>

        {/* ── Join Room ── */}
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-gold">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <div className="font-display text-xl">Join Room</div>
              <div className="text-xs text-muted-foreground">Enter the code from your opponent</div>
            </div>
          </div>

          <div className="text-xs uppercase tracking-[0.22em] text-gold/80">
            Room Code or Invite Link
          </div>
          <input
            value={joinCode}
            onChange={(e) => handleCodeInput(e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              handleCodeInput(e.clipboardData.getData("text"));
            }}
            placeholder="ABC123"
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-center font-mono text-2xl uppercase tracking-[0.3em] outline-none transition focus:border-gold/40"
            maxLength={6}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <p className="mt-2 text-xs text-center text-muted-foreground">
            6-character code, or paste a full invite link — it auto-extracts the code
          </p>

          <div className="mt-6">
            <GoldButton
              className="w-full"
              onClick={handleJoin}
              disabled={joining || joinCode.length !== 6}
            >
              {joining ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Joining…
                </>
              ) : (
                "Join Room"
              )}
            </GoldButton>
          </div>

          {/* How it works */}
          <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-xs text-muted-foreground space-y-1.5">
            <div className="font-medium text-foreground/70 mb-2">How it works</div>
            <div>1. Your opponent creates a room and shares the 6-letter code.</div>
            <div>2. Enter the code above and click Join Room.</div>
            <div>3. Once both players are in, the host starts the game.</div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
