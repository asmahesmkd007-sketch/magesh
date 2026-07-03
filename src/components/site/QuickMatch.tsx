import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Swords, X, Bot, Rocket, Zap, Timer } from "lucide-react";
import { Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { matchmake, leaveQueue, type TimeClass } from "@/lib/api/gameClient";

const CATEGORIES = [
  {
    name: "Bullet",
    cls: "bullet" as TimeClass,
    icon: Rocket,
    options: [
      { label: "1 min", tc: "1+0", sec: 60, inc: 0 },
      { label: "1 | 1", tc: "1+1", sec: 60, inc: 1 },
      { label: "2 | 1", tc: "2+1", sec: 120, inc: 1 },
      { label: "30 sec", tc: "0.5+0", sec: 30, inc: 0 },
      { label: "20 sec | 1", tc: "0.33+1", sec: 20, inc: 1 },
    ],
  },
  {
    name: "Blitz",
    cls: "blitz" as TimeClass,
    icon: Zap,
    options: [
      { label: "3 min", tc: "3+0", sec: 180, inc: 0 },
      { label: "3 | 2", tc: "3+2", sec: 180, inc: 2 },
      { label: "5 min", tc: "5+0", sec: 300, inc: 0 },
      { label: "5 | 3", tc: "5+3", sec: 300, inc: 3 },
    ],
  },
  {
    name: "Rapid",
    cls: "rapid" as TimeClass,
    icon: Timer,
    options: [
      { label: "10 min", tc: "10+0", sec: 600, inc: 0 },
      { label: "10 | 5", tc: "10+5", sec: 600, inc: 5 },
      { label: "15 | 10", tc: "15+10", sec: 900, inc: 10 },
      { label: "20 min", tc: "20+0", sec: 1200, inc: 0 },
      { label: "30 min", tc: "30+0", sec: 1800, inc: 0 },
      { label: "60 min", tc: "60+0", sec: 3600, inc: 0 },
    ],
  },
];

const ALL_OPTIONS = CATEGORIES.flatMap((c) =>
  c.options.map((o) => ({ ...o, cls: c.cls, catName: c.name }))
);

const POLL_MS = 2500;

export function QuickMatch({ onPlayBot }: { onPlayBot?: () => void } = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pickTc, setPickTc] = useState("10+0");
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

  async function attempt(opt: typeof ALL_OPTIONS[0]) {
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
    const opt = ALL_OPTIONS.find((o) => o.tc === pickTc) || ALL_OPTIONS[0];
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

  // No human opponent yet — fall back to the local engine.
  async function playBotInstead() {
    await cancelSearch();
    onPlayBot?.();
  }

  if (searching) {
    const opt = ALL_OPTIONS.find((o) => o.tc === pickTc) || ALL_OPTIONS[0];
    return (
      <Card className="mx-auto max-w-md p-10 text-center border-gold/20 shadow-2xl shadow-gold/5">
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-gold" />
        <h3 className="mt-6 font-display text-2xl text-gradient-gold">Seeking Opponent</h3>
        <p className="mt-2 text-sm text-muted-foreground">{opt.label} {opt.catName} · Ranked</p>
        <div className="mt-6 font-mono text-4xl text-foreground">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
        </div>
        {elapsed >= 30 && onPlayBot && (
          <p className="mt-6 text-xs text-muted-foreground bg-white/5 p-3 rounded-lg border border-white/10">
            No opponent yet at your rating. Widening the search — or play the computer now.
          </p>
        )}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <GhostButton onClick={cancelSearch} className="w-full sm:w-auto">
            <X className="h-4 w-4" /> Cancel
          </GhostButton>
          {elapsed >= 30 && onPlayBot && (
            <GoldButton onClick={playBotInstead} className="w-full sm:w-auto">
              <Bot className="h-4 w-4" /> Play Computer
            </GoldButton>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 md:p-8 border-gold/10 bg-gradient-to-b from-background to-white/[0.01]">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gold/80 mb-2">Quick Match</div>
      <p className="text-sm text-muted-foreground mb-8">
        Pick a time control and we'll pair you with a player of similar standing.
      </p>

      <div className="space-y-6">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <div key={cat.name}>
              <div className="flex items-center gap-2 text-sm font-semibold text-gold mb-3 opacity-90">
                <Icon className="h-4 w-4" />
                {cat.name}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-3">
                {cat.options.map((o) => (
                  <button
                    key={o.tc}
                    onClick={() => setPickTc(o.tc)}
                    className={`rounded-xl border px-3 py-3 text-sm transition-all duration-200 font-medium ${
                      pickTc === o.tc
                        ? "border-gold bg-gold/15 text-gold shadow-[0_0_15px_rgba(212,175,55,0.15)] scale-[1.02]"
                        : "border-white/10 text-muted-foreground bg-white/[0.02] hover:border-gold/30 hover:bg-white/[0.04] hover:text-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 pt-6 border-t border-white/5">
        <GoldButton onClick={startSearch} className="w-full justify-center py-6 text-lg shadow-xl shadow-gold/10">
          <Swords className="h-5 w-5 mr-2" /> Find Match
        </GoldButton>
      </div>
    </Card>
  );
}
