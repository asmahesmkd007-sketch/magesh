import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageShell, Card, SectionTitle, GoldButton } from "@/components/site/Primitives";
import {
  Heart,
  MessageCircle,
  Share2,
  TrendingUp,
  Calendar,
  Bookmark,
  Flag,
  UserPlus,
  HeartOff,
  Reply,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/community")({
  head: () => ({ meta: [{ title: "Community — ChessOx" }] }),
  component: Community,
});

const POSTS = [
  ["GM Anand", "8h", "The Najdorf is back in fashion at the elite level. Here's why...", 1240, 86],
  ["IM Tania", "1d", "Streaming live tonight: speed run from 1000 to 2500 ELO. Tune in!", 540, 32],
  ["PriyaKnights", "2d", "Just hit 1800 Blitz! What an unreal journey 🙏", 220, 18],
  ["NajdorfNinja", "3d", "My favorite endgame pattern explained in one diagram.", 412, 24],
];

function Community() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleProtectedAction = (e: React.MouseEvent, action: string) => {
    e.preventDefault();
    if (!user) {
      toast("Login required to continue");
      navigate({ to: "/login" });
      return;
    }
    // Proceed with action for authenticated user
    toast(`Action triggered: ${action}`);
  };

  return (
    <PageShell
      eyebrow="The Court"
      title="Community"
      subtitle="Posts, discussions, and live events from chess minds across the kingdom."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <div className="flex gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full gradient-gold text-[#0B0D10] font-display">
                A
              </div>
              <input
                className="flex-1 rounded-full border border-white/10 bg-white/[0.02] px-4 text-sm outline-none focus:border-gold/40"
                placeholder="Share a position, a question, a victory…"
                onClick={(e) => {
                  if (!user) {
                    e.preventDefault();
                    toast("Login required to continue");
                    navigate({ to: "/login" });
                  }
                }}
              />
              <GoldButton onClick={(e) => handleProtectedAction(e, "Create Post")}>Post</GoldButton>
            </div>
          </Card>

          {POSTS.map(([u, t, c, l, com]) => (
            <Card key={c as string} className="p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-gold/10 text-sm text-gold">
                  {(u as string)[0]}
                </div>
                <div>
                  <div className="font-display">{u}</div>
                  <div className="text-xs text-muted-foreground">{t} ago</div>
                </div>
              </div>
              <p className="mt-3 text-sm">{c}</p>
              <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-muted-foreground uppercase tracking-widest">
                <button
                  className="flex items-center gap-1 hover:text-gold transition-colors"
                  onClick={(e) => handleProtectedAction(e, "Like")}
                >
                  <Heart className="h-3.5 w-3.5" /> {l}
                </button>
                <button
                  className="flex items-center gap-1 hover:text-gold transition-colors"
                  onClick={(e) => handleProtectedAction(e, "Unlike")}
                >
                  <HeartOff className="h-3.5 w-3.5" />
                </button>
                <button
                  className="flex items-center gap-1 hover:text-gold transition-colors"
                  onClick={(e) => handleProtectedAction(e, "Comment")}
                >
                  <MessageCircle className="h-3.5 w-3.5" /> {com}
                </button>
                <button
                  className="flex items-center gap-1 hover:text-gold transition-colors"
                  onClick={(e) => handleProtectedAction(e, "Reply")}
                >
                  <Reply className="h-3.5 w-3.5" /> Reply
                </button>
                <button
                  className="flex items-center gap-1 hover:text-gold transition-colors"
                  onClick={(e) => handleProtectedAction(e, "Share")}
                >
                  <Share2 className="h-3.5 w-3.5" /> Share
                </button>
                <button
                  className="flex items-center gap-1 hover:text-gold transition-colors"
                  onClick={(e) => handleProtectedAction(e, "Bookmark")}
                >
                  <Bookmark className="h-3.5 w-3.5" /> Save
                </button>
                <div className="ml-auto flex gap-4">
                  <button
                    className="flex items-center gap-1 hover:text-gold transition-colors"
                    onClick={(e) => handleProtectedAction(e, "Follow User")}
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Follow
                  </button>
                  <button
                    className="flex items-center gap-1 hover:text-destructive transition-colors"
                    onClick={(e) => handleProtectedAction(e, "Report")}
                  >
                    <Flag className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle kicker="Trending" title="Topics" />
            <ul className="space-y-2 text-sm">
              {["#MaharajaCup", "#Sicilian", "#PuzzleRush", "#GukeshGM", "#EndgameStudy"].map(
                (t) => (
                  <li
                    key={t}
                    className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2"
                  >
                    <span>{t}</span>
                    <TrendingUp className="h-3.5 w-3.5 text-gold" />
                  </li>
                ),
              )}
            </ul>
          </Card>

          <Card className="p-5">
            <SectionTitle kicker="Public" title="Discussion Rooms" />
            <Link
              to="/room"
              className="block rounded-lg border border-gold/30 bg-gold/5 p-3 text-sm"
            >
              <div className="font-display text-gold">Enter Public Room →</div>
              <div className="text-xs text-muted-foreground">2,134 members online</div>
            </Link>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
