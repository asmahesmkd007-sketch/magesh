import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Ban, Download, Loader2, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { resetRatings, setUserStatus } from "@/lib/api/adminClient";

export const Route = createFileRoute("/admin/leaderboard")({
  head: () => ({
    meta: [
      { title: "Admin — Leaderboard — ChessOx" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AdminShell title="Leaderboard">
      <LeaderboardAdmin />
    </AdminShell>
  ),
});

type Row = {
  id: string;
  username: string;
  full_name: string;
  country: string | null;
  state: string | null;
  iq_level: number;
  community_score: number;
  status: string;
  created_at: string;
};

const PAGE_SIZE = 50;

function LeaderboardAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      let query = (supabase as any)
        .from("profiles")
        .select(
          "id, username, full_name, country, state, iq_level, community_score, status, created_at",
          {
            count: "exact",
          },
        )
        .order("iq_level", { ascending: false })
        .order("community_score", { ascending: false })
        .limit(PAGE_SIZE);
      if (search.trim()) {
        const q = search.trim().replace(/[%_]/g, "");
        query = query.or(`full_name.ilike.%${q}%,username.ilike.%${q}%`);
      }
      query.then(({ data, count }: { data: Row[] | null; count: number | null }) => {
        if (cancelled) return;
        setRows(data ?? []);
        setTotal(count ?? 0);
        setLoading(false);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search]);

  async function handleBan(userId: string) {
    if (!confirm("Ban this account? This is reversible from the Users page.")) return;
    setBusyId(userId);
    try {
      await setUserStatus(
        userId,
        "banned",
        "Removed via Leaderboard admin (suspected fake account)",
      );
      toast.success("Account banned");
      setRows((prev) => prev.filter((r) => r.id !== userId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to ban account");
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetRank(userId: string) {
    if (!confirm("Reset this player's ratings back to the default (100)?")) return;
    setBusyId(userId);
    try {
      await resetRatings(userId, 100);
      toast.success("Ratings reset");
      setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, community_score: 0 } : r)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset ratings");
    } finally {
      setBusyId(null);
    }
  }

  function exportCsv() {
    const header =
      "Rank,Username,Display Name,Country,State,IQ Level,Community Score,Status,Joined\n";
    const body = rows
      .map((r, i) =>
        [
          i + 1,
          r.username,
          r.full_name,
          r.country ?? "",
          r.state ?? "",
          r.iq_level,
          r.community_score,
          r.status,
          r.created_at,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chessox-leaderboard-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const shownCount = useMemo(() => rows.length, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player or username…"
            className="w-full rounded-lg border border-white/10 bg-white/[0.02] py-2 pl-9 pr-3 text-sm outline-none focus:border-gold/40"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Showing {shownCount} of {total.toLocaleString()}
          </span>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-muted-foreground hover:border-gold/40 hover:text-gold"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Player</th>
                <th className="px-4 py-3 text-left">Location</th>
                <th className="px-4 py-3 text-right">IQ</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.full_name || r.username}</div>
                    <div className="text-xs text-muted-foreground">@{r.username}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {[r.state, r.country].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-display text-gold">{r.iq_level}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {r.community_score}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        r.status === "active"
                          ? "bg-emerald/10 text-emerald"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to="/admin/users"
                        className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted-foreground hover:border-gold/40 hover:text-gold"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleResetRank(r.id)}
                        disabled={busyId === r.id}
                        title="Reset ratings"
                        className="grid h-7 w-7 place-items-center rounded-full border border-white/10 text-muted-foreground hover:border-gold/40 hover:text-gold disabled:opacity-40"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleBan(r.id)}
                        disabled={busyId === r.id}
                        title="Ban (remove fake account)"
                        className="grid h-7 w-7 place-items-center rounded-full border border-white/10 text-muted-foreground hover:border-red-400/40 hover:text-red-400 disabled:opacity-40"
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
