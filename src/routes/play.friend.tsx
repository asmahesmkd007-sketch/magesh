import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { useAuth } from "@/hooks/useAuth";
import { createChallenge, type TimeClass, type HostColor } from "@/lib/api/gameClient";
import { Copy, Crown, Users } from "lucide-react";

export const Route = createFileRoute("/play/friend")({
  head: () => ({ meta: [{ title: "Play a Friend — ChessOx" }] }),
  component: PlayFriend,
});

const TIME_CONTROLS: {
  label: string;
  tc: string;
  class: TimeClass;
  sec: number;
  inc: number;
}[] = [
  { label: "1+0 Bullet", tc: "1+0", class: "bullet", sec: 60, inc: 0 },
  { label: "2+1 Bullet", tc: "2+1", class: "bullet", sec: 120, inc: 1 },
  { label: "3+0 Blitz", tc: "3+0", class: "blitz", sec: 180, inc: 0 },
  { label: "3+2 Blitz", tc: "3+2", class: "blitz", sec: 180, inc: 2 },
  { label: "5+0 Blitz", tc: "5+0", class: "blitz", sec: 300, inc: 0 },
  { label: "5+3 Blitz", tc: "5+3", class: "blitz", sec: 300, inc: 3 },
  { label: "10+0 Rapid", tc: "10+0", class: "rapid", sec: 600, inc: 0 },
  { label: "10+5 Rapid", tc: "10+5", class: "rapid", sec: 600, inc: 5 },
  { label: "15+10 Rapid", tc: "15+10", class: "rapid", sec: 900, inc: 10 },
  { label: "30+0 Classical", tc: "30+0", class: "classical", sec: 1800, inc: 0 },
];

function PlayFriend() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [pick, setPick] = useState(2);
  const [color, setColor] = useState<HostColor>("random");
  const [rated, setRated] = useState(true);
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  if (!loading && !user) {
    return (
      <PageShell title="Play a Friend" subtitle="Sign in to challenge a friend.">
        <Link to="/auth">
          <GoldButton>Sign in</GoldButton>
        </Link>
      </PageShell>
    );
  }

  async function handleCreate() {
    if (!user) return;
    const tc = TIME_CONTROLS[pick];
    setCreating(true);
    try {
      // create_challenge RPC creates the game row server-side with proper RLS bypass
      // and sets the host's rating, username, and color atomically
      const gameId = await createChallenge({
        timeClass: tc.class,
        timeControl: tc.tc,
        initialSeconds: tc.sec,
        incrementSeconds: tc.inc,
        isRated: rated,
        hostColor: color,
      });
      setLink(`${window.location.origin}/game/${gameId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create challenge.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <PageShell
      eyebrow="Royal Challenge"
      title="Play a Friend"
      subtitle="Forge a private match and share the scroll with your opponent."
    >
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="p-6 lg:col-span-7">
          <div className="text-xs uppercase tracking-[0.22em] text-gold/80">Time Control</div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TIME_CONTROLS.map((t, i) => (
              <button
                key={t.tc + t.label}
                onClick={() => setPick(i)}
                className={`rounded-xl border px-3 py-2 text-sm transition ${
                  i === pick
                    ? "border-gold bg-gold/10 text-gold"
                    : "border-white/10 hover:border-gold/40"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-6 text-xs uppercase tracking-[0.22em] text-gold/80">Your color</div>
          <div className="mt-3 flex gap-2">
            {(["random", "w", "b"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`rounded-xl border px-4 py-2 text-sm capitalize transition ${
                  color === c
                    ? "border-gold bg-gold/10 text-gold"
                    : "border-white/10 hover:border-gold/40"
                }`}
              >
                {c === "w" ? "White" : c === "b" ? "Black" : "Random"}
              </button>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <input
              id="rated"
              type="checkbox"
              checked={rated}
              onChange={(e) => setRated(e.target.checked)}
              className="h-4 w-4 accent-[#D4AF37]"
            />
            <label htmlFor="rated" className="text-sm">
              Rated match — affects your kingdom's Elo
            </label>
          </div>

          <div className="mt-8 flex gap-3">
            <GoldButton onClick={handleCreate} disabled={creating || !!link}>
              <Crown className="h-4 w-4" /> {creating ? "Forging…" : "Create Challenge"}
            </GoldButton>
            <Link to="/play">
              <GhostButton>
                <Users className="h-4 w-4" /> Vs Computer
              </GhostButton>
            </Link>
          </div>
        </Card>

        <Card className="p-6 lg:col-span-5">
          <div className="text-xs uppercase tracking-[0.22em] text-gold/80">Challenge Link</div>
          {link ? (
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                Share this scroll. The throne is empty until your opponent enters.
              </p>
              <div className="mt-4 flex gap-2">
                <input
                  readOnly
                  value={link}
                  className="flex-1 rounded-lg border border-gold/30 bg-white/[0.02] px-3 py-2 font-mono text-xs"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(link)}
                  className="grid h-9 w-9 place-items-center rounded-lg gradient-gold text-[#0B0D10]"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5">
                <GoldButton
                  onClick={() =>
                    navigate({ to: "/game/$id", params: { id: link.split("/").pop()! } })
                  }
                >
                  Enter the Arena
                </GoldButton>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Choose a time control and create your challenge. We will mint a private link you can
              share with anyone.
            </p>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
