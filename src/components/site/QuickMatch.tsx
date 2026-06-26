import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Swords, X } from "lucide-react";
import { Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { matchmake, leaveQueue, type TimeClass } from "@/lib/api/gameClient";

type Option = { label: string; tc: string; cls: TimeClass; sec: number; inc: number };

const OPTIONS: Option[] = [
  { label: "1+0 Bullet", tc: "1+0", cls: "bullet", sec: 60, inc: 0 },
  { label: "3+0 Blitz", tc: "3+0", cls: "blitz", sec: 180, inc: 0 },
  { label: "3+2 Blitz", tc: "3+2", cls: "blitz", sec: 180, inc: 2 },
  { label: "5+0 Blitz", tc: "5+0", cls: "blitz", sec: 300, inc: 0 },
  { label: "10+0 Rapid", tc: "10+0", cls: "rapid", sec: 600, inc: 0 },
  { label: "15+10 Rapid", tc: "15+10", cls: "rapid", sec: 900, inc: 10 },
];

const POLL_MS = 2500;

export function QuickMatch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pick, setPick] = useState(3);
  const [searching, setSearching] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const goneToGame = useRef(false);

  const cleanup = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    pollRef.current = null;
    tickRef.current = null;
  }, []);

  const goToGame = useCallback(
    (gameId: string) => {
      if (goneToGame.current) return;
      goneToGame.current = true;
      cleanup();
      navigate({ to: "/game/$id", params: { id: gameId } });
    },
    [cleanup, navigate],
  );

  // While searching, listen for a game created by an opponent who paired with us.
  useEffect(() => {
    if (!searching || !user) return;
    const ch = supabase
      .channel(`mm:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "games", filter: `white_id=eq.${user.id}` },
        (p) => goToGame((p.new as { id: string }).id),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "games", filter: `black_id=eq.${user.id}` },
        (p) => goToGame((p.new as { id: string }).id),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [searching, user, goToGame]);

  useEffect(
    () => () => {
      cleanup();
      void leaveQueue().catch(() => {});
    },
    [cleanup],
  );

  async function attempt(opt: Option) {
    try {
      const gameId = await matchmake({
        timeClass: opt.cls,
        timeControl: opt.tc,
        initialSeconds: opt.sec,
        incrementSeconds: opt.inc,
      });
      if (gameId) goToGame(gameId);
    } catch (err) {
      cleanup();
      setSearching(false);
      toast.error(err instanceof Error ? err.message : "Matchmaking failed");
    }
  }

  async function startSearch() {
    if (!user) {
      toast.error("Sign in to play ranked");
      return;
    }
    const opt = OPTIONS[pick];
    goneToGame.current = false;
    setSearching(true);
    setElapsed(0);
    await attempt(opt);
    if (goneToGame.current) return;
    pollRef.current = setInterval(() => attempt(opt), POLL_MS);
    tickRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }

  async function cancelSearch() {
    cleanup();
    setSearching(false);
    await leaveQueue().catch(() => {});
  }

  if (searching) {
    const opt = OPTIONS[pick];
    return (
      <Card className="mx-auto max-w-md p-10 text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-gold" />
        <h3 className="mt-4 font-display text-2xl">Seeking a worthy opponent…</h3>
        <p className="mt-1 text-sm text-muted-foreground">{opt.label} · Ranked</p>
        <div className="mt-4 font-mono text-3xl text-gradient-gold">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
        </div>
        <div className="mt-6">
          <GhostButton onClick={cancelSearch}>
            <X className="h-4 w-4" /> Cancel
          </GhostButton>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="text-xs uppercase tracking-[0.22em] text-gold/80">Quick Match · Ranked</div>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick a time control and we'll pair you with a player of similar standing.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {OPTIONS.map((o, i) => (
          <button
            key={o.label}
            onClick={() => setPick(i)}
            className={`rounded-xl border px-3 py-2 text-sm transition ${i === pick ? "border-gold bg-gold/10 text-gold" : "border-white/10 hover:border-gold/40"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        <GoldButton onClick={startSearch}>
          <Swords className="h-4 w-4" /> Find Match
        </GoldButton>
      </div>
    </Card>
  );
}
