import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, SectionTitle } from "@/components/site/Primitives";
import { Search as SearchIcon, User, Users, Trophy, Newspaper, Loader2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "Search — ChessOx" }] }),
  component: Search,
});

type Profile = { id: string; username: string; display_name: string | null };
type Club = { id: string; name: string; member_count: number | null };
type Tournament = { id: string; name: string; format: string | null };
type Article = {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  read_time_min: number | null;
};

function Search() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!q.trim()) {
      setPlayers([]);
      setClubs([]);
      setTournaments([]);
      setArticles([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      const term = `%${q.trim()}%`;
      const [{ data: p }, { data: c }, { data: t }, { data: a }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,username,display_name")
          .or(`username.ilike.${term},display_name.ilike.${term}`)
          .limit(5),
        supabase.from("clubs").select("id,name,member_count").ilike("name", term).limit(5),
        supabase.from("tournaments").select("id,name,format").ilike("name", term).limit(5),
        supabase
          .from("news_articles")
          .select("id,title,slug,category,read_time_min")
          .ilike("title", term)
          .limit(5),
      ]);
      setPlayers((p ?? []) as Profile[]);
      setClubs((c ?? []) as Club[]);
      setTournaments((t ?? []) as Tournament[]);
      setArticles((a ?? []) as Article[]);
      setLoading(false);
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  const hasResults = players.length + clubs.length + tournaments.length + articles.length > 0;

  return (
    <PageShell eyebrow="Find" title="Search the Court">
      <Card className="flex items-center gap-3 p-3">
        <SearchIcon className="ml-2 h-5 w-5 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 bg-transparent px-2 py-2 text-base outline-none"
          placeholder="Players, clubs, tournaments, articles…"
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin text-gold" />}
        <span className="rounded-full bg-gold/10 px-2.5 py-1 text-xs text-gold">⌘K</span>
      </Card>

      {!q.trim() && (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Start typing to search across the platform.
        </p>
      )}

      {q.trim() && !loading && !hasResults && (
        <Card className="mt-8 p-10 text-center text-muted-foreground">No results for "{q}"</Card>
      )}

      {hasResults && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {players.length > 0 && (
            <Card className="p-6">
              <SectionTitle kicker="Players" title="People" />
              <ul className="space-y-2">
                {players.map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/profile"
                      search={{ id: p.id }}
                      className="flex items-center gap-3 rounded-lg border border-white/5 p-3 text-sm hover:border-gold/20"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-gold/10 text-gold">
                        <User className="h-4 w-4" />
                      </span>
                      <div className="flex-1">
                        <div>{p.display_name ?? p.username}</div>
                        <div className="text-xs text-muted-foreground">@{p.username}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {clubs.length > 0 && (
            <Card className="p-6">
              <SectionTitle kicker="Clubs" title="Communities" />
              <ul className="space-y-2">
                {clubs.map((c) => (
                  <li key={c.id}>
                    <Link
                      to="/clubs"
                      className="flex items-center gap-3 rounded-lg border border-white/5 p-3 text-sm hover:border-gold/20"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-gold/10 text-gold">
                        <Users className="h-4 w-4" />
                      </span>
                      <div className="flex-1">{c.name}</div>
                      <span className="text-xs text-muted-foreground">
                        {c.member_count ?? 0} members
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {tournaments.length > 0 && (
            <Card className="p-6">
              <SectionTitle kicker="Events" title="Tournaments" />
              <ul className="space-y-2">
                {tournaments.map((t) => (
                  <li key={t.id}>
                    <Link
                      to="/tournaments"
                      className="flex items-center gap-3 rounded-lg border border-white/5 p-3 text-sm hover:border-gold/20"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-gold/10 text-gold">
                        <Trophy className="h-4 w-4" />
                      </span>
                      <div className="flex-1">{t.name}</div>
                      <span className="text-xs text-muted-foreground">{t.format ?? ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {articles.length > 0 && (
            <Card className="p-6">
              <SectionTitle kicker="Reads" title="Articles" />
              <ul className="space-y-2">
                {articles.map((a) => (
                  <li key={a.id}>
                    <Link
                      to="/news/$slug"
                      params={{ slug: a.slug }}
                      className="flex items-center gap-3 rounded-lg border border-white/5 p-3 text-sm hover:border-gold/20"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-gold/10 text-gold">
                        <Newspaper className="h-4 w-4" />
                      </span>
                      <div className="flex-1">{a.title}</div>
                      <span className="text-xs text-muted-foreground">
                        {a.read_time_min ? `${a.read_time_min} min` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </PageShell>
  );
}
