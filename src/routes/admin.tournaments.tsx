import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, Square, XCircle, Users, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { forceStartTournament, forceEndTournament } from "@/lib/api/adminClient";
import { cancelTournament } from "@/lib/api/walletClient";

export const Route = createFileRoute("/admin/tournaments")({
  head: () => ({ meta: [{ title: "Admin — Tournaments — ChessOx" }] }),
  component: () => (
    <AdminShell title="Tournament Management">
      <TournamentsAdmin />
    </AdminShell>
  ),
});

type Row = {
  id: string;
  name: string;
  status: string;
  time_control: string;
  entry_fee_coins: number;
  player_count: number;
  max_players: number;
  winner_display: string | null;
  prizes_distributed: boolean;
};

const FILTERS = ["upcoming", "locked", "live", "completed", "cancelled"] as const;

function TournamentsAdmin() {
  const [filter, setFilter] = useState<string>("live");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (
      supabase as unknown as {
        from: (n: string) => {
          select: (s: string) => {
            eq: (
              c: string,
              v: string,
            ) => {
              order: (c: string, o: object) => Promise<{ data: unknown[] | null }>;
            };
          };
        };
      }
    )
      .from("tournaments")
      .select(
        "id,name,status,time_control,entry_fee_coins,player_count,max_players,winner_display,prizes_distributed",
      )
      .eq("status", filter)
      .order("created_at", { ascending: false });
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-xs capitalize ${
              filter === f
                ? "border-gold/40 bg-gold/10 text-gold"
                : "border-white/10 text-muted-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <Card className="p-0">
        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No {filter} tournaments.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.time_control} · {t.entry_fee_coins} coins · {t.player_count}/{t.max_players}{" "}
                    players
                    {t.winner_display && ` · 🏆 ${t.winner_display}`}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/tournament/$id"
                    params={{ id: t.id }}
                    className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs hover:text-gold"
                  >
                    <Users className="h-3 w-3" /> View <ExternalLink className="h-3 w-3" />
                  </Link>
                  {(t.status === "upcoming" || t.status === "locked") && (
                    <button
                      onClick={() => act(() => forceStartTournament(t.id), "Tournament started")}
                      className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400"
                    >
                      <Play className="h-3 w-3" /> Force Start
                    </button>
                  )}
                  {t.status === "live" && (
                    <button
                      onClick={() => act(() => forceEndTournament(t.id), "Tournament ended")}
                      className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400"
                    >
                      <Square className="h-3 w-3" /> Force End
                    </button>
                  )}
                  {t.status !== "completed" && t.status !== "cancelled" && (
                    <button
                      onClick={() => {
                        if (window.confirm("Cancel & refund all entrants?"))
                          act(() => cancelTournament(t.id), "Tournament cancelled & refunded");
                      }}
                      className="flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-400"
                    >
                      <XCircle className="h-3 w-3" /> Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
