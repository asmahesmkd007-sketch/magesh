import { useEffect, useState } from "react";
import { Shield, Swords, Search, Check, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  getClanWars,
  searchClansByName,
  declareWar,
  respondToWar,
  ClanApiError,
} from "@/lib/clanApi";
import { PanelEmpty, PanelLoading } from "@/components/clan/ClanPrimitives";
import type { ClanWar, ClanRole } from "@/types/clan";

interface Props {
  clanId: string;
  myRole: ClanRole | null;
  onChanged?: () => void;
}

export function WarsPanel({ clanId, myRole, onChanged }: Props) {
  const { user } = useAuth();
  const [wars, setWars] = useState<ClanWar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChallenge, setShowChallenge] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; tag: string; slug: string }[]>(
    [],
  );
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setWars(await getClanWars(clanId));
    } catch {
      setWars([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clanId]);

  async function handleSearch() {
    if (!search.trim()) return;
    try {
      setResults(await searchClansByName(search.trim(), clanId));
    } catch {
      setResults([]);
    }
  }

  async function handleDeclare(defenderId: string) {
    if (myRole !== "leader") return;
    try {
      await declareWar(defenderId);
      toast.success("War declared! Waiting for the other clan's leader to respond.");
      setShowChallenge(false);
      setResults([]);
      setSearch("");
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof ClanApiError ? err.message : "Failed to declare war");
    }
  }

  async function handleRespond(warId: string, accept: boolean) {
    setBusy(warId);
    try {
      await respondToWar(warId, accept);
      toast.success(accept ? "War accepted — let the battle begin!" : "War declined");
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof ClanApiError ? err.message : "Failed to respond to war");
    } finally {
      setBusy(null);
    }
  }

  const incoming =
    user && myRole === "leader"
      ? wars.filter((w) => w.status === "pending" && w.defender_clan_id === clanId)
      : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-white">Clan Wars</h3>
        {myRole === "leader" && (
          <button
            onClick={() => setShowChallenge(!showChallenge)}
            className="flex items-center gap-2 rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-gold/90"
          >
            <Swords className="h-4 w-4" /> Declare War
          </button>
        )}
      </div>

      {incoming.length > 0 && (
        <div className="space-y-3">
          {incoming.map((war) => (
            <div
              key={war.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/30 bg-gold/5 p-4"
            >
              <div className="text-sm text-white">
                <span className="font-semibold text-gold">{war.challenger.name}</span> [
                {war.challenger.tag}] has declared war on your clan.
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRespond(war.id, true)}
                  disabled={busy === war.id}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/30 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Accept
                </button>
                <button
                  onClick={() => handleRespond(war.id, false)}
                  disabled={busy === war.id}
                  className="flex items-center gap-1.5 rounded-lg bg-destructive/20 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/30 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showChallenge && (
        <div className="rounded-2xl border border-gold/30 bg-white/[0.02] p-5">
          <h4 className="mb-4 font-display text-lg text-white">Challenge a Clan</h4>
          <div className="mb-4 flex items-center gap-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-gold/50"
              placeholder="Search clans to challenge..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <button
              onClick={handleSearch}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20"
            >
              Search
            </button>
          </div>
          <div className="space-y-2">
            {results.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">{r.name}</span>
                  <span className="font-mono text-xs text-gold">[{r.tag}]</span>
                </div>
                <button
                  onClick={() => handleDeclare(r.id)}
                  className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-destructive transition-colors hover:text-destructive/80"
                >
                  <Swords className="h-3 w-3" /> Challenge
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <PanelLoading />
      ) : wars.length === 0 ? (
        <PanelEmpty
          icon={Shield}
          title="No wars yet"
          hint="This clan has not participated in any wars yet."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {wars.map((war) => {
            const isChallenger = war.challenger_clan_id === clanId;
            const opponent = isChallenger ? war.defender : war.challenger;
            const statusColor =
              war.status === "active"
                ? "text-destructive"
                : war.status === "pending"
                  ? "text-gold"
                  : "text-muted-foreground";
            return (
              <div
                key={war.id}
                className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-5 text-center"
              >
                <div
                  className={`absolute inset-x-0 top-0 h-1 ${
                    war.status === "active"
                      ? "bg-destructive"
                      : war.status === "pending"
                        ? "bg-gold"
                        : "bg-white/10"
                  }`}
                />
                <div
                  className={`mb-4 text-xs font-semibold uppercase tracking-widest ${statusColor}`}
                >
                  {war.status}
                </div>
                <div className="flex w-full items-center justify-center gap-6">
                  <div className="flex flex-1 flex-col items-center">
                    <div className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-white/10 font-display text-xl text-white">
                      {isChallenger ? "US" : "DEF"}
                    </div>
                    <span className="text-sm font-medium text-white">Your Clan</span>
                  </div>
                  <Swords className="h-6 w-6 shrink-0 text-muted-foreground/50" />
                  <div className="flex flex-1 flex-col items-center">
                    <Link
                      to="/clan/$slug"
                      params={{ slug: opponent.slug }}
                      className="transition-opacity hover:opacity-80"
                    >
                      <div className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-white/10 font-display text-xl text-gold">
                        {opponent.name[0]?.toUpperCase()}
                      </div>
                    </Link>
                    <Link
                      to="/clan/$slug"
                      params={{ slug: opponent.slug }}
                      className="text-sm font-medium text-white transition-colors hover:text-gold"
                    >
                      {opponent.name}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
