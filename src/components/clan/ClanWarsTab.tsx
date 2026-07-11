import { useEffect, useState } from "react";
import { Shield, Swords, Search } from "lucide-react";
import { Card, SectionTitle, GoldButton } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

interface War {
  id: string;
  challenger_clan_id: string;
  defender_clan_id: string;
  status: "pending" | "active" | "finished" | "cancelled";
  created_at: string;
  challenger: { name: string; tag: string; slug: string };
  defender: { name: string; tag: string; slug: string };
}

interface Props {
  clanId: string;
  myRole: "leader" | "co_leader" | "member" | null;
}

export function ClanWarsTab({ clanId, myRole }: Props) {
  const [wars, setWars] = useState<War[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChallenge, setShowChallenge] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; tag: string; slug: string }[]>([]);

  useEffect(() => {
    async function load() {
      // Load wars where this clan is challenger or defender
      const { data } = await supabase
        .from("clan_wars")
        .select(`
          id, challenger_clan_id, defender_clan_id, status, created_at,
          challenger:clans!challenger_clan_id(name, tag, slug),
          defender:clans!defender_clan_id(name, tag, slug)
        `)
        .or(`challenger_clan_id.eq.${clanId},defender_clan_id.eq.${clanId}`)
        .order("created_at", { ascending: false });

      if (data) {
        setWars(data as unknown as War[]);
      }
      setLoading(false);
    }
    load();
  }, [clanId]);

  async function searchClans() {
    if (!search.trim()) return;
    const { data } = await supabase
      .from("clans")
      .select("id, name, tag, slug")
      .ilike("name", `%${search}%`)
      .neq("id", clanId)
      .limit(5);
    setResults(data || []);
  }

  async function declareWar(defenderId: string) {
    if (myRole !== "leader" && myRole !== "co_leader") return;
    
    // In a real app, you would use an RPC or just an insert if RLS allows
    const { data, error } = await supabase.from("clan_wars").insert({
      challenger_clan_id: clanId,
      defender_clan_id: defenderId,
      status: "pending",
    }).select().single();

    if (error) {
      toast.error(error.message || "Failed to declare war");
      return;
    }

    toast.success("War declared! Waiting for acceptance.");
    setShowChallenge(false);
    // Reload page to reflect new war state
    window.location.reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionTitle kicker="Battlefield" title="Clan Wars" />
        {myRole && myRole !== "member" && (
          <GoldButton onClick={() => setShowChallenge(!showChallenge)}>
            <Swords className="h-4 w-4" /> Declare War
          </GoldButton>
        )}
      </div>

      {showChallenge && (
        <Card className="p-6 border-gold/30">
          <h3 className="font-display text-xl mb-4">Declare War on a Clan</h3>
          <div className="flex items-center gap-3 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              className="flex-1 bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:border-gold/50"
              placeholder="Search clans to challenge..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchClans()}
            />
            <button onClick={searchClans} className="bg-white/10 px-4 py-2 rounded-md hover:bg-white/20 text-sm transition-colors">
              Search
            </button>
          </div>
          
          <div className="space-y-2">
            {results.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 bg-black/20 rounded-md border border-white/5">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{r.name}</div>
                  <span className="text-xs text-gold font-mono">[{r.tag}]</span>
                </div>
                <button
                  onClick={() => declareWar(r.id)}
                  className="text-xs text-destructive hover:text-destructive/80 font-bold tracking-wider uppercase flex items-center gap-1"
                >
                  <Swords className="h-3 w-3" /> Challenge
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading wars...</div>
      ) : wars.length === 0 ? (
        <Card className="p-10 text-center flex flex-col items-center justify-center">
          <Shield className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">This clan has not participated in any wars yet.</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {wars.map((war) => {
            const isChallenger = war.challenger_clan_id === clanId;
            const opponent = isChallenger ? war.defender : war.challenger;
            
            return (
              <Card key={war.id} className="p-5 flex flex-col items-center justify-center text-center relative overflow-hidden group">
                <div className={`absolute top-0 inset-x-0 h-1 ${
                  war.status === 'active' ? 'bg-destructive' : 
                  war.status === 'pending' ? 'bg-gold' : 'bg-white/10'
                }`} />
                
                <div className="text-xs uppercase tracking-widest text-muted-foreground mb-4 font-semibold flex items-center gap-1.5">
                  <span className={war.status === 'active' ? 'text-destructive' : war.status === 'pending' ? 'text-gold' : ''}>
                    {war.status}
                  </span>
                </div>
                
                <div className="flex items-center justify-center gap-6 w-full">
                  <div className="flex flex-col items-center flex-1">
                    <div className="h-12 w-12 rounded-full bg-white/10 grid place-items-center font-display text-xl mb-2">
                      {isChallenger ? "US" : "OPP"}
                    </div>
                    <span className="text-sm font-medium">Your Clan</span>
                  </div>
                  
                  <Swords className="h-6 w-6 text-muted-foreground/50 shrink-0" />
                  
                  <div className="flex flex-col items-center flex-1">
                    <Link to="/clan/$slug" params={{ slug: opponent.slug }} className="hover:opacity-80 transition-opacity">
                      <div className="h-12 w-12 rounded-full bg-white/10 grid place-items-center font-display text-xl text-gold mb-2">
                        {opponent.name[0].toUpperCase()}
                      </div>
                    </Link>
                    <Link to="/clan/$slug" params={{ slug: opponent.slug }} className="text-sm font-medium hover:text-gold transition-colors">
                      {opponent.name}
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
