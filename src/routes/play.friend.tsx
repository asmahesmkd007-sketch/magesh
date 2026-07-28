import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { useAuth } from "@/hooks/useAuth";
import {
  createChallenge,
  sendChallenge,
  type TimeClass,
  type HostColor,
} from "@/lib/api/gameClient";
import { Copy, Crown, Users, Swords } from "lucide-react";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";
import { useFriends } from "@/hooks/useFriends";
import { UserAvatar } from "@/components/site/UserAvatar";

export const Route = createFileRoute("/play/friend")({
  head: () =>
    seo({
      title: "Play Chess With Friends Online — Private Chess Game | ChessOx",
      description:
        "Play chess with friends online on ChessOx. Pick a time control, create a private chess game and share the invite link — no download and free to play.",
      keywords: [
        "play chess with friends online",
        "chess with friends",
        "online chess with friends",
        "private chess game online",
        "multiplayer chess game",
      ],
      path: "/play/friend",
      jsonLd: [
        webPageLd({
          name: "Play Chess With Friends Online — ChessOx",
          description:
            "Create a private online chess game on ChessOx, choose bullet, blitz, rapid or classical time controls and invite a friend with a shareable link.",
          path: "/play/friend",
          primaryTopic: "Play chess with friends online",
          about: ["Play chess with friends", "Private chess game", "Multiplayer chess game"],
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Play Chess", path: "/play" },
          { name: "Play With Friends", path: "/play/friend" },
        ]),
      ],
    }),
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
  const [creating, setCreating] = useState(false);
  const [challengingId, setChallengingId] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const { friends } = useFriends(user?.id);

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
      const gameId = await createChallenge({
        timeClass: tc.class,
        timeControl: tc.tc,
        initialSeconds: tc.sec,
        incrementSeconds: tc.inc,
        isRated: false,
        hostColor: color,
      });
      setLink(`${window.location.origin}/game/${gameId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create challenge.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDirectChallenge(friendId: string) {
    if (!user) return;
    const tc = TIME_CONTROLS[pick];
    setChallengingId(friendId);
    try {
      await sendChallenge({
        opponentId: friendId,
        timeClass: tc.class,
        timeControl: tc.tc,
        initialSeconds: tc.sec,
        incrementSeconds: tc.inc,
        hostColor: "random",
        isRated: false,
      });
      toast.success("Challenge sent!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send challenge.");
    } finally {
      setChallengingId(null);
    }
  }

  return (
    <PageShell
      eyebrow="Royal Challenge"
      title="Play a Friend"
      subtitle="Forge a private match and share the scroll with your opponent."
      compact={true}
    >
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="p-6 lg:col-span-7">
          <div className="text-xs uppercase tracking-[0.22em] text-gold/80">Time Control</div>
          <div className="mt-3 space-y-3">
            {["bullet", "blitz", "rapid", "classical"].map((category) => {
              const controls = TIME_CONTROLS.map((t, i) => ({ t, i })).filter(
                ({ t }) => t.class === category,
              );
              if (controls.length === 0) return null;
              return (
                <div key={category}>
                  <div className="mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {category}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {controls.map(({ t, i }) => (
                      <button
                        key={t.tc + t.label}
                        onClick={() => setPick(i)}
                        className={`rounded-lg border px-2 py-1.5 text-xs transition ${
                          i === pick
                            ? "border-gold bg-gold/10 text-gold"
                            : "border-white/10 hover:border-gold/40"
                        }`}
                      >
                        {t.tc}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
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

        <div className="lg:col-span-5 space-y-6">
          <Card className="p-6">
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

          {friends.length > 0 && (
            <Card className="p-6">
              <div className="text-xs uppercase tracking-[0.22em] text-gold/80 mb-4">
                Your Friends
              </div>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {friends.map((friend) => (
                  <div key={friend.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <UserAvatar
                          avatarUrl={friend.other_avatar_url}
                          displayName={friend.other_display || friend.other_username || "Unknown"}
                          size="md"
                        />
                        <div
                          className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#121418] ${
                            friend.other_activity === "online"
                              ? "bg-emerald-500"
                              : friend.other_activity === "playing"
                                ? "bg-amber-500"
                                : "bg-zinc-500"
                          }`}
                        />
                      </div>
                      <div className="flex flex-col text-left">
                        <span className="font-semibold leading-tight text-gold/90">
                          {friend.other_display || friend.other_username || "Unknown"}
                        </span>
                        <span className="text-xs text-muted-foreground mt-0.5">
                          {friend.other_activity === "playing"
                            ? "Playing"
                            : friend.other_activity === "online"
                              ? "Online"
                              : "Offline"}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDirectChallenge(friend.other_id!)}
                      disabled={challengingId === friend.other_id}
                      className="group flex h-8 items-center gap-1.5 rounded-full border border-gold/30 bg-gold/5 px-3 text-xs font-medium text-gold/80 transition hover:bg-gold hover:text-[#0B0D10] disabled:opacity-50"
                    >
                      <Swords className="h-3.5 w-3.5 transition group-hover:scale-110" />
                      {challengingId === friend.other_id ? "Sending..." : "Play"}
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </PageShell>
  );
}
