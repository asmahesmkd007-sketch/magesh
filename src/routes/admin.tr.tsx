import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  ChevronDown,
  ChevronRight,
  Coins,
  ExternalLink,
  Landmark,
  Loader2,
  Play,
  Search,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import {
  adminTrFinance,
  adminTrOverview,
  getTournamentState,
  roundLabel,
  type AdminTrFinanceRow,
  type AdminTrRow,
  type TournamentState,
} from "@/lib/api/tournamentClient";
import { END_REASON_LABEL, fmtDateTime, fmtDuration } from "@/components/tournament/bits";

export const Route = createFileRoute("/admin/tr")({
  head: () => ({
    meta: [
      { title: "Admin — Tournament Room (TR) — ChessOx" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AdminShell title="Tournament Room (TR)">
      <TrAdmin />
    </AdminShell>
  ),
});

// =====================================================================
// Admin TR panel: live/completed/upcoming tournaments with money and
// match aggregates, searchable and filterable, expandable into full
// per-tournament detail (players, matches with replay links, captured
// pieces, finance ledger). Realtime: any tournaments change reloads.
// =====================================================================
const STATUS_FILTERS = ["all", "live", "locked", "upcoming", "completed", "cancelled"] as const;

function TrAdmin() {
  const [rows, setRows] = useState<AdminTrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminTrOverview({
        status: status === "all" ? null : status,
        search: search || null,
        from: from ? new Date(from).toISOString() : null,
        to: to ? new Date(new Date(to).getTime() + 86400000).toISOString() : null,
      });
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    setLoading(false);
  }, [status, search, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: keep the overview honest while tournaments run.
  useEffect(() => {
    const ch = supabase
      .channel("admin_tr_overview")
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "tournaments" } as never,
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          fees: acc.fees + r.fees_collected,
          prizes: acc.prizes + r.prizes_paid,
          refunds: acc.refunds + r.refunds_paid,
          platform: acc.platform + (r.platform_revenue ?? 0),
        }),
        { fees: 0, prizes: 0, refunds: 0, platform: 0 },
      ),
    [rows],
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-lg px-3 py-1.5 text-xs capitalize transition ${
                status === s
                  ? "bg-gold/15 text-gold border border-gold/30"
                  : "border border-white/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / id / slug…"
              className="w-52 rounded-lg border border-white/10 bg-white/[0.02] py-1.5 pl-8 pr-2 text-xs outline-none focus:border-gold/40"
            />
          </div>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5 text-xs outline-none focus:border-gold/40"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5 text-xs outline-none focus:border-gold/40"
          />
        </div>
      </Card>

      {/* Money summary for the current filter */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Entry Fees Collected", value: totals.fees, cls: "text-emerald" },
          { label: "Prizes Paid", value: totals.prizes, cls: "text-gold" },
          { label: "Refunds Paid", value: totals.refunds, cls: "text-rose-400" },
          { label: "Platform Revenue", value: totals.platform, cls: "text-amber-400" },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {s.label}
            </div>
            <div className={`mt-1 flex items-center gap-1.5 font-stat text-2xl ${s.cls}`}>
              <Coins className="h-4 w-4" /> {s.value.toLocaleString("en-IN")}
            </div>
          </Card>
        ))}
      </div>

      {loading && (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      )}
      {!loading && error && (
        <Card className="p-6 text-sm text-rose-400">
          {error}{" "}
          <button onClick={() => void load()} className="ml-2 text-gold underline">
            Retry
          </button>
        </Card>
      )}
      {!loading && !error && rows.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No tournaments match these filters.
        </Card>
      )}

      {!loading &&
        !error &&
        rows.map((r) => (
          <TrRow
            key={r.id}
            r={r}
            open={openId === r.id}
            onToggle={() => setOpenId(openId === r.id ? null : r.id)}
          />
        ))}
    </div>
  );
}

function TrRow({ r, open, onToggle }: { r: AdminTrRow; open: boolean; onToggle: () => void }) {
  const statusCls: Record<string, string> = {
    live: "text-emerald",
    locked: "text-amber-400",
    upcoming: "text-muted-foreground",
    completed: "text-gold",
    cancelled: "text-rose-400",
  };
  return (
    <Card className="overflow-hidden p-0">
      <button
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition hover:bg-white/[0.02]"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-gold" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{r.name}</div>
          <div className="font-mono text-[10px] text-muted-foreground/60">
            TR-{r.id.slice(0, 8).toUpperCase()} · {r.time_control} · {fmtDateTime(r.created_at)}
          </div>
        </div>
        <span className={`text-xs capitalize ${statusCls[r.status] ?? ""}`}>{r.status}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3" /> {r.player_count}/{r.max_players}
        </span>
        <span className="flex items-center gap-1 text-xs text-emerald" title="Entry fees collected">
          <Banknote className="h-3 w-3" /> {r.fees_collected}
        </span>
        <span className="flex items-center gap-1 text-xs text-gold" title="Prizes paid">
          <Trophy className="h-3 w-3" /> {r.prizes_paid}
        </span>
        {(r.platform_revenue ?? 0) > 0 && (
          <span
            className="flex items-center gap-1 text-xs text-amber-400"
            title="Platform revenue (house cut)"
          >
            <Landmark className="h-3 w-3" /> {r.platform_revenue}
          </span>
        )}
        <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Matches">
          <Swords className="h-3 w-3" /> {r.total_matches}
        </span>
        {r.status === "live" && (
          <span className="flex items-center gap-1 text-xs text-emerald">
            <Play className="h-3 w-3" /> R{r.current_round}/{r.total_rounds}
          </span>
        )}
        {r.winner_display && (
          <span className="inline-flex items-center gap-1 text-xs text-gold">
            <Trophy className="h-3 w-3" /> {r.winner_display}
          </span>
        )}
      </button>

      {open && <TrDetail r={r} />}
    </Card>
  );
}

function TrDetail({ r }: { r: AdminTrRow }) {
  const [state, setState] = useState<TournamentState | null>(null);
  const [finance, setFinance] = useState<AdminTrFinanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"players" | "matches" | "captures" | "finance">("players");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getTournamentState(r.id), adminTrFinance(r.id)])
      .then(([s, f]) => {
        if (!alive) return;
        setState(s);
        setFinance(f);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load detail"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [r.id]);

  if (loading) {
    return (
      <div className="grid place-items-center border-t border-white/5 py-10">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }
  if (!state) return null;

  const chips = [
    { label: "Checkmates", v: r.checkmates },
    { label: "Resigns", v: r.resigns },
    { label: "Timeouts", v: r.timeouts },
    { label: "No-shows", v: r.no_shows },
    { label: "Draws", v: r.draws },
    { label: "Aborts", v: r.aborted },
    { label: "Captures", v: r.captures },
    { label: "Capture pts", v: r.capture_points },
  ];

  return (
    <div className="border-t border-white/5 p-4">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span
            key={c.label}
            className="rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[10px] text-muted-foreground"
          >
            {c.label}: <span className="text-foreground">{c.v}</span>
          </span>
        ))}
        <Link
          to="/tournament/$id"
          params={{ id: r.id }}
          className="ml-auto flex items-center gap-1 rounded-full border border-gold/25 bg-gold/5 px-2.5 py-1 text-[10px] text-gold hover:bg-gold/10"
        >
          <ExternalLink className="h-3 w-3" /> Open TR page
        </Link>
      </div>

      <div className="mb-3 flex gap-1.5">
        {(["players", "matches", "captures", "finance"] as const).map((x) => (
          <button
            key={x}
            onClick={() => setTab(x)}
            className={`rounded-lg px-3 py-1.5 text-xs capitalize ${
              tab === x
                ? "border border-gold/30 bg-gold/10 text-gold"
                : "border border-white/10 text-muted-foreground"
            }`}
          >
            {x}
          </button>
        ))}
      </div>

      <div className="-mx-1 max-h-[380px] overflow-auto px-1">
        {tab === "players" && (
          <table className="w-full min-w-[620px] text-xs">
            <thead className="text-[9px] uppercase tracking-widest text-muted-foreground">
              <tr className="border-b border-white/5">
                <th className="pb-2 text-left">#</th>
                <th className="pb-2 text-left">Player</th>
                <th className="pb-2 text-right">Pts</th>
                <th className="pb-2 text-center">W/L/D</th>
                <th className="pb-2 text-right">Pieces</th>
                <th className="pb-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {state.entries.map((e, i) => (
                <tr key={e.id}>
                  <td className="py-1.5">{e.rank ?? i + 1}</td>
                  <td className="py-1.5">
                    {e.username ?? "—"}
                    <span className="ml-1 text-muted-foreground/60">({e.country ?? "—"})</span>
                  </td>
                  <td className="py-1.5 text-right text-gold">{Number(e.score)}</td>
                  <td className="py-1.5 text-center">
                    {e.wins}/{e.losses}/{e.draws}
                  </td>
                  <td className="py-1.5 text-right">{e.piece_points}</td>
                  <td className="py-1.5 text-right capitalize text-muted-foreground">
                    {e.status.replace("_", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "matches" && (
          <table className="w-full min-w-[680px] text-xs">
            <thead className="text-[9px] uppercase tracking-widest text-muted-foreground">
              <tr className="border-b border-white/5">
                <th className="pb-2 text-left">Round</th>
                <th className="pb-2 text-left">Pairing</th>
                <th className="pb-2 text-left">Result</th>
                <th className="pb-2 text-right">Moves</th>
                <th className="pb-2 text-right">Duration</th>
                <th className="pb-2 text-right">Replay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {state.matches.map((m) => (
                <tr key={m.id}>
                  <td className="py-1.5">{roundLabel(m.round, state.tournament.total_rounds)}</td>
                  <td className="py-1.5">
                    {m.player1_username ?? "—"} vs{" "}
                    {m.player2_username ?? (m.status === "bye" ? "Bye" : "—")}
                  </td>
                  <td className="py-1.5">
                    {m.status === "bye" ? (
                      <span className="text-muted-foreground">Bye</span>
                    ) : m.winner_id ? (
                      <span>
                        <span className="text-gold">
                          {m.winner_id === m.player1_id ? m.player1_username : m.player2_username}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          ({END_REASON_LABEL[m.end_reason ?? ""] ?? m.end_reason ?? "—"})
                        </span>
                      </span>
                    ) : (
                      <span className="text-emerald">In progress</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right">{m.moves_count ?? "—"}</td>
                  <td className="py-1.5 text-right">
                    {fmtDuration(m.game_created_at, m.game_ended_at)}
                  </td>
                  <td className="py-1.5 text-right">
                    {m.game_id && (
                      <Link
                        to="/game/$id/review"
                        params={{ id: m.game_id }}
                        className="text-gold hover:underline"
                      >
                        Replay
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "captures" && (
          <table className="w-full min-w-[520px] text-xs">
            <thead className="text-[9px] uppercase tracking-widest text-muted-foreground">
              <tr className="border-b border-white/5">
                <th className="pb-2 text-left">When</th>
                <th className="pb-2 text-left">Capturer</th>
                <th className="pb-2 text-left">Victim</th>
                <th className="pb-2 text-center">Piece</th>
                <th className="pb-2 text-right">Bonus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(state.captures ?? []).map((c) => (
                <tr key={c.id}>
                  <td className="py-1.5 text-muted-foreground">{fmtDateTime(c.created_at)}</td>
                  <td className="py-1.5">{c.capturer_username ?? "—"}</td>
                  <td className="py-1.5 text-muted-foreground">{c.victim_username ?? "—"}</td>
                  <td className="py-1.5 text-center uppercase">{c.piece}</td>
                  <td className="py-1.5 text-right text-gold">+{c.bonus}</td>
                </tr>
              ))}
              {(state.captures ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted-foreground">
                    No captures recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === "finance" && (
          <table className="w-full min-w-[620px] text-xs">
            <thead className="text-[9px] uppercase tracking-widest text-muted-foreground">
              <tr className="border-b border-white/5">
                <th className="pb-2 text-left">When</th>
                <th className="pb-2 text-left">Player</th>
                <th className="pb-2 text-left">Type</th>
                <th className="pb-2 text-right">Amount</th>
                <th className="pb-2 text-left">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {finance.map((f) => (
                <tr key={f.id}>
                  <td className="py-1.5 text-muted-foreground">{fmtDateTime(f.created_at)}</td>
                  <td className="py-1.5">{f.username ?? "—"}</td>
                  <td className="py-1.5 capitalize text-muted-foreground">
                    {f.type.replace("tournament_", "")}
                  </td>
                  <td
                    className={`py-1.5 text-right ${f.amount < 0 ? "text-rose-400" : "text-emerald"}`}
                  >
                    {f.amount > 0 ? "+" : ""}
                    {f.amount}
                  </td>
                  <td className="max-w-[220px] truncate py-1.5 text-muted-foreground">
                    {f.description}
                  </td>
                </tr>
              ))}
              {finance.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted-foreground">
                    No transactions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
