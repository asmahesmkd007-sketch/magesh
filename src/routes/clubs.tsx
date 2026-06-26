import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, SectionTitle, GoldButton } from "@/components/site/Primitives";
import { Users, Search, Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/clubs")({
  head: () => ({ meta: [{ title: "Clubs — ChessOx" }] }),
  component: Clubs,
});

type Club = {
  id: string;
  name: string;
  description: string | null;
  member_count: number | null;
  cover_gradient: string | null;
  created_at: string;
};

const GRADIENTS = [
  "from-amber-500 to-rose-700",
  "from-emerald-500 to-teal-700",
  "from-violet-500 to-indigo-700",
  "from-sky-500 to-blue-700",
  "from-pink-500 to-purple-700",
  "from-orange-500 to-amber-700",
];

function Clubs() {
  const { user } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [joining, setJoining] = useState<string | null>(null);
  const [myClubs, setMyClubs] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    setLoading(true);
    supabase
      .from("clubs")
      .select("id,name,description,member_count,cover_gradient,created_at")
      .order("member_count", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setClubs((data ?? []) as Club[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("club_members")
      .select("club_id")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setMyClubs(new Set((data ?? []).map((r: { club_id: string }) => r.club_id)));
      });
  }, [user]);

  async function joinClub(clubId: string) {
    if (!user) {
      toast.error("Sign in to join clubs");
      return;
    }
    setJoining(clubId);
    const { error } = await supabase
      .from("club_members")
      .insert({ club_id: clubId, user_id: user.id } as never);
    if (!error) {
      setMyClubs((prev) => new Set([...prev, clubId]));
      setClubs((prev) =>
        prev.map((c) => (c.id === clubId ? { ...c, member_count: (c.member_count ?? 0) + 1 } : c)),
      );
      toast.success("Joined club!");
    } else {
      toast.error("Could not join club");
    }
    setJoining(null);
  }

  async function leaveClub(clubId: string) {
    if (!user) return;
    await supabase.from("club_members").delete().eq("club_id", clubId).eq("user_id", user.id);
    setMyClubs((prev) => {
      const s = new Set(prev);
      s.delete(clubId);
      return s;
    });
    setClubs((prev) =>
      prev.map((c) =>
        c.id === clubId ? { ...c, member_count: Math.max(0, (c.member_count ?? 1) - 1) } : c,
      ),
    );
    toast.success("Left club");
  }

  async function createClub() {
    if (!user || !newName.trim()) return;
    setCreating(true);
    const slug =
      newName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") +
      "-" +
      Date.now();
    const { data, error } = await supabase
      .from("clubs")
      .insert({ name: newName.trim(), slug, owner_id: user.id } as never)
      .select("id,name,description,member_count,cover_gradient,created_at")
      .maybeSingle();
    if (error) {
      toast.error("Could not create club");
      setCreating(false);
      return;
    }
    if (data) {
      const club = data as Club;
      setClubs((prev) => [club, ...prev]);
      await supabase
        .from("club_members")
        .insert({ club_id: club.id, user_id: user.id, role: "owner" } as never);
      setMyClubs((prev) => new Set([...prev, club.id]));
      toast.success("Club created!");
    }
    setNewName("");
    setCreating(false);
  }

  const filtered = clubs.filter(
    (c) =>
      !query ||
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      (c.description ?? "").toLowerCase().includes(query.toLowerCase()),
  );

  const featured = filtered.slice(0, 3);
  const directory = filtered.slice(3);

  return (
    <PageShell
      eyebrow="Brotherhood"
      title="Clubs"
      subtitle="Join a court of like-minded royals. Compete, learn, and rise together."
    >
      <Card className="mb-8 flex items-center gap-3 p-3">
        <Search className="ml-2 h-4 w-4 text-muted-foreground" />
        <input
          className="flex-1 bg-transparent px-2 py-1.5 text-sm outline-none"
          placeholder="Search clubs by name, city or region…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {user && (
          <div className="flex items-center gap-2">
            <input
              className="rounded-full border border-gold/30 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-gold/60"
              placeholder="New club name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createClub();
              }}
            />
            <GoldButton onClick={createClub} disabled={creating || !newName.trim()}>
              <Plus className="h-4 w-4" /> Create
            </GoldButton>
          </div>
        )}
      </Card>

      {loading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No clubs found. Create the first one!
        </Card>
      ) : (
        <>
          <SectionTitle kicker="Featured" title="Royal courts" />
          <div className="grid gap-4 md:grid-cols-3">
            {featured.map((c, i) => (
              <Link to="/club" key={c.id}>
                <Card className="overflow-hidden transition-transform hover:-translate-y-1">
                  <div
                    className={`relative h-32 bg-gradient-to-br ${c.cover_gradient ?? GRADIENTS[i % GRADIENTS.length]}`}
                  >
                    <div className="absolute inset-0 mandala-bg opacity-50" />
                    <div className="absolute inset-0 grid place-items-center font-display text-5xl text-black/30">
                      ♛
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="font-display text-xl">{c.name}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{c.description ? c.description.slice(0, 30) : ""}</span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {c.member_count ?? 0}
                      </span>
                    </div>
                    <div className="mt-3">
                      {myClubs.has(c.id) ? (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            leaveClub(c.id);
                          }}
                          className="rounded-full border border-white/20 px-3 py-1 text-xs text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                        >
                          Leave
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            joinClub(c.id);
                          }}
                          disabled={joining === c.id}
                          className="rounded-full border border-gold/30 px-3 py-1 text-xs text-gold hover:bg-gold/10"
                        >
                          {joining === c.id ? "Joining…" : "Join"}
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {directory.length > 0 && (
            <>
              <SectionTitle kicker="Directory" title="All clubs" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {directory.map((c) => (
                  <Card
                    key={c.id}
                    className="flex items-center justify-between p-4 hover:border-gold/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-lg gradient-gold text-[#0B0D10] font-display">
                        {c.name[0]}
                      </div>
                      <div>
                        <div className="text-sm font-display">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.member_count ?? 0} members
                        </div>
                      </div>
                    </div>
                    {myClubs.has(c.id) ? (
                      <button
                        onClick={() => leaveClub(c.id)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Leave
                      </button>
                    ) : (
                      <button
                        onClick={() => joinClub(c.id)}
                        disabled={joining === c.id}
                        className="text-xs text-gold hover:text-gold/70"
                      >
                        {joining === c.id ? "…" : "Join"}
                      </button>
                    )}
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
