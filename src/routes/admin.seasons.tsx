import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Pause, Play, Plus, RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card, GoldButton } from "@/components/site/Primitives";
import {
  adminCreateSeason,
  adminEndSeason,
  adminPauseSeason,
  adminRecalculateSeason,
  adminResumeSeason,
  adminStartSeason,
  listSeasons,
  type Season,
} from "@/lib/api/seasonsClient";

export const Route = createFileRoute("/admin/seasons")({
  head: () => ({
    meta: [
      { title: "Admin — Seasons — ChessOx" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AdminShell title="Seasons">
      <SeasonsAdmin />
    </AdminShell>
  ),
});

const STATUS_STYLE: Record<string, string> = {
  live: "bg-emerald/10 text-emerald",
  upcoming: "bg-white/10 text-muted-foreground",
  paused: "bg-amber-500/10 text-amber-400",
  ended: "bg-white/5 text-muted-foreground",
};

function toLocalInput(iso: string) {
  return new Date(iso).toISOString().slice(0, 16);
}

function SeasonsAdmin() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [start, setStart] = useState(() => toLocalInput(new Date().toISOString()));
  const [end, setEnd] = useState(() =>
    toLocalInput(new Date(Date.now() + 30 * 86400000).toISOString()),
  );

  function reload() {
    setLoading(true);
    listSeasons()
      .then(setSeasons)
      .finally(() => setLoading(false));
  }
  useEffect(reload, []);

  async function run(fn: () => Promise<unknown>, successMsg: string) {
    try {
      await fn();
      toast.success(successMsg);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusyId("create");
    try {
      await adminCreateSeason(name, new Date(start).toISOString(), new Date(end).toISOString());
      toast.success("Season created");
      setShowCreate(false);
      setName("");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create season");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Only one season can be live at a time. Ending a season locks in final ranks, awards
          badges, and (by default) auto-starts the next one.
        </p>
        <GoldButton onClick={() => setShowCreate((v) => !v)} className="!px-4 !py-2 text-xs">
          <Plus className="h-3.5 w-3.5" /> New Season
        </GoldButton>
      </div>

      {showCreate && (
        <Card className="p-5">
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Season name (optional)"
              className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40 sm:col-span-2"
            />
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
            />
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
            />
            <GoldButton
              type="submit"
              disabled={busyId === "create"}
              className="!px-4 !py-2 text-xs sm:col-span-4 sm:w-fit"
            >
              {busyId === "create" ? "Creating…" : "Create Season"}
            </GoldButton>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Season</th>
                <th className="px-4 py-3 text-left">Window</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => (
                <tr key={s.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="font-display">
                      Season {s.season_number}
                      {s.name ? ` — ${s.name}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(s.start_date).toLocaleDateString()} –{" "}
                    {new Date(s.end_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[s.status]}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {(s.status === "upcoming" || s.status === "paused") && (
                        <button
                          onClick={() =>
                            run(
                              () =>
                                s.status === "paused"
                                  ? adminResumeSeason(s.id)
                                  : adminStartSeason(s.id),
                              "Season started",
                            )
                          }
                          title="Start"
                          className="grid h-7 w-7 place-items-center rounded-full border border-white/10 text-muted-foreground hover:border-emerald/40 hover:text-emerald"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {s.status === "live" && (
                        <>
                          <button
                            onClick={() => run(() => adminPauseSeason(s.id), "Season paused")}
                            title="Pause"
                            className="grid h-7 w-7 place-items-center rounded-full border border-white/10 text-muted-foreground hover:border-amber-400/40 hover:text-amber-400"
                          >
                            <Pause className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              run(() => adminRecalculateSeason(s.id), "Rankings recalculated")
                            }
                            title="Recalculate rankings"
                            className="grid h-7 w-7 place-items-center rounded-full border border-white/10 text-muted-foreground hover:border-gold/40 hover:text-gold"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      {(s.status === "live" || s.status === "paused") && (
                        <button
                          onClick={() => {
                            if (
                              !confirm(`End Season ${s.season_number}? This locks in final ranks.`)
                            )
                              return;
                            run(
                              () => adminEndSeason(s.id, true),
                              "Season ended, next season started",
                            );
                          }}
                          title="End season"
                          className="grid h-7 w-7 place-items-center rounded-full border border-white/10 text-muted-foreground hover:border-red-400/40 hover:text-red-400"
                        >
                          <Square className="h-3.5 w-3.5" />
                        </button>
                      )}
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
