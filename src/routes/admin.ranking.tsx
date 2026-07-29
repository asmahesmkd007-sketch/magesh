import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, ShieldBan, SlidersHorizontal } from "lucide-react";

import { AdminShell } from "@/components/site/AdminShell";
import { Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  adminAdjustSeasonPoints,
  adminGetSeasonConfig,
  adminRankingAnalytics,
  adminSetSeasonBan,
  adminUpdateSeasonConfig,
  type SeasonConfig,
} from "@/lib/api/rankingClient";
import { TIERS, type TierCode } from "@/lib/ranking/tiers";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/admin/ranking")({
  head: () => noindexSeo("Ranking Admin — ChessOx", "Configure the ELO and Season Points systems."),
  component: AdminRanking,
});

function NumberField({
  label,
  value,
  onChange,
  hint,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm tabular-nums outline-none focus:border-gold/40"
      />
      {hint && <span className="mt-0.5 block text-[10px] text-muted-foreground/70">{hint}</span>}
    </label>
  );
}

function AdminRanking() {
  const { isAdmin, loading } = useIsAdmin();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SeasonConfig | null>(null);

  const configQuery = useQuery({
    queryKey: ["admin-season-config"],
    queryFn: adminGetSeasonConfig,
    enabled: isAdmin,
    retry: 1,
  });

  const analytics = useQuery({
    queryKey: ["admin-ranking-analytics"],
    queryFn: adminRankingAnalytics,
    enabled: isAdmin,
    retry: 1,
  });

  useEffect(() => {
    if (configQuery.data) setDraft(configQuery.data);
  }, [configQuery.data]);

  const save = useMutation({
    mutationFn: (patch: Partial<SeasonConfig>) => adminUpdateSeasonConfig(patch),
    onSuccess: (next) => {
      setDraft(next);
      toast.success("Ranking configuration saved. New games use it immediately.");
      void queryClient.invalidateQueries({ queryKey: ["season-config"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  // Manual adjustment / ban form.
  const [targetId, setTargetId] = useState("");
  const [points, setPoints] = useState(0);
  const [reason, setReason] = useState("");

  const adjust = useMutation({
    mutationFn: () => adminAdjustSeasonPoints(targetId.trim(), points, reason.trim()),
    onSuccess: (applied) => {
      toast.success(`Applied ${applied >= 0 ? "+" : ""}${applied} SP.`);
      setPoints(0);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["admin-ranking-analytics"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Adjustment failed."),
  });

  const ban = useMutation({
    mutationFn: (banned: boolean) =>
      adminSetSeasonBan(targetId.trim(), banned, reason.trim() || undefined),
    onSuccess: () => {
      toast.success("Season ranking status updated.");
      void queryClient.invalidateQueries({ queryKey: ["admin-ranking-analytics"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update."),
  });

  // AdminShell owns the access guard and redirect; this only avoids
  // flashing an empty form while the role check resolves.
  if (loading || !isAdmin) {
    return (
      <AdminShell title="Ranking System">
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      </AdminShell>
    );
  }

  const setRate = (tier: TierCode, key: "win" | "draw" | "loss", value: number) => {
    setDraft((d) =>
      d
        ? {
            ...d,
            sp_rates: { ...d.sp_rates, [tier]: { ...d.sp_rates[tier], [key]: value } },
          }
        : d,
    );
  };

  return (
    <AdminShell title="Ranking System">
      {/* Analytics */}
      <Card className="mb-4 p-5">
        <h3 className="mb-3 font-display text-lg">Season analytics</h3>
        {analytics.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-gold" />
        ) : analytics.data ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Ranked", analytics.data.ranked_players],
                ["Active", analytics.data.active_players],
                ["Banned", analytics.data.banned_players],
                ["Games", analytics.data.games_counted],
                ["SP awarded", analytics.data.sp_awarded],
                ["SP deducted", analytics.data.sp_deducted],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-center"
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {label}
                  </div>
                  <div className="mt-0.5 font-display text-lg tabular-nums text-gold">
                    {Number(value).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Tier distribution
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TIERS.map((t) => (
                  <span
                    key={t.code}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${t.badge} ${t.text}`}
                  >
                    {t.name}: {analytics.data!.tier_distribution?.[t.code] ?? 0}
                  </span>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Analytics unavailable.</p>
        )}
      </Card>

      {/* SP rates */}
      <Card className="mb-4 p-5">
        <div className="mb-3 flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-gold" />
          <h3 className="font-display text-lg">Season Point rates</h3>
        </div>
        {!draft ? (
          <Loader2 className="h-4 w-4 animate-spin text-gold" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2">Tier</th>
                    <th className="py-2">Win</th>
                    <th className="py-2">Draw</th>
                    <th className="py-2">Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {TIERS.map((t) => (
                    <tr key={t.code} className="border-b border-white/5">
                      <td className={`py-1.5 ${t.text}`}>{t.name}</td>
                      {(["win", "draw", "loss"] as const).map((key) => (
                        <td key={key} className="py-1.5 pr-2">
                          <input
                            type="number"
                            value={draft.sp_rates[t.code]?.[key] ?? 0}
                            onChange={(e) => setRate(t.code, key, Number(e.target.value))}
                            className="w-20 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 text-sm tabular-nums outline-none focus:border-gold/40"
                            aria-label={`${t.name} ${key}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <NumberField
                label="Demotion grace (SP)"
                value={draft.demotion_grace_sp}
                onChange={(v) => setDraft({ ...draft, demotion_grace_sp: v })}
                hint="How far below a threshold before demotion."
              />
              <NumberField
                label="Minimum moves for SP"
                value={draft.min_moves_for_sp}
                onChange={(v) => setDraft({ ...draft, min_moves_for_sp: v })}
                hint="Shorter games award nothing."
              />
              <NumberField
                label="Daily SP cap"
                value={draft.daily_sp_cap}
                onChange={(v) => setDraft({ ...draft, daily_sp_cap: v })}
                hint="0 disables the cap."
              />
              <NumberField
                label="Repeat opponent limit"
                value={draft.repeat_opponent_limit}
                onChange={(v) => setDraft({ ...draft, repeat_opponent_limit: v })}
                hint="Games vs the same player before the farming guard applies."
              />
              <NumberField
                label="Repeat opponent payout %"
                value={draft.repeat_opponent_pct}
                onChange={(v) => setDraft({ ...draft, repeat_opponent_pct: v })}
                hint="Percentage paid once over the limit."
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Upset bonus (by tier gap)</div>
                <div className="flex gap-2">
                  {["1", "2", "3"].map((gap) => (
                    <input
                      key={gap}
                      type="number"
                      value={draft.upset_bonus[gap] ?? 0}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          upset_bonus: { ...draft.upset_bonus, [gap]: Number(e.target.value) },
                        })
                      }
                      className="w-20 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 text-sm tabular-nums outline-none focus:border-gold/40"
                      aria-label={`Upset bonus ${gap} tiers`}
                    />
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Penalties</div>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(draft.penalties).map((kind) => (
                    <label key={kind} className="text-[10px] text-muted-foreground">
                      {kind}
                      <input
                        type="number"
                        value={draft.penalties[kind]}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            penalties: { ...draft.penalties, [kind]: Number(e.target.value) },
                          })
                        }
                        className="mt-0.5 block w-20 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 text-sm tabular-nums text-foreground outline-none focus:border-gold/40"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <GoldButton onClick={() => save.mutate(draft)} disabled={save.isPending}>
                <Save className="h-4 w-4" />
                {save.isPending ? "Saving…" : "Save configuration"}
              </GoldButton>
              <GhostButton onClick={() => configQuery.data && setDraft(configQuery.data)}>
                Reset
              </GhostButton>
            </div>
          </>
        )}
      </Card>

      {/* Manual actions */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldBan className="h-4 w-4 text-gold" />
          <h3 className="font-display text-lg">Player actions</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className="text-xs text-muted-foreground">Player user ID</span>
            <input
              type="text"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="uuid"
              className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 font-mono text-xs outline-none focus:border-gold/40"
            />
          </label>
          <NumberField label="SP adjustment" value={points} onChange={setPoints} />
        </div>
        <label className="mt-3 block">
          <span className="text-xs text-muted-foreground">Reason (shown to the player)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm outline-none focus:border-gold/40"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <GoldButton
            onClick={() => adjust.mutate()}
            disabled={!targetId.trim() || points === 0 || adjust.isPending}
          >
            Apply adjustment
          </GoldButton>
          <GhostButton
            onClick={() => ban.mutate(true)}
            disabled={!targetId.trim() || ban.isPending}
          >
            Remove from season
          </GhostButton>
          <GhostButton
            onClick={() => ban.mutate(false)}
            disabled={!targetId.trim() || ban.isPending}
          >
            Reinstate
          </GhostButton>
        </div>
      </Card>
    </AdminShell>
  );
}
