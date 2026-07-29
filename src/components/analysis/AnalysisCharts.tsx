// =====================================================================
// AnalysisCharts — the game's story in graphs
// ---------------------------------------------------------------------
// Six tabbed panel charts over the mainline: evaluation, win
// probability, material balance, per-move accuracy, time usage (when
// the PGN carried clocks) and review search depth. One shared SVG
// renderer supplies the crosshair + tooltip hover layer, click/drag-
// to-seek, the current-position marker and a recessive grid.
//
// Colour rules (validated): the two-series accuracy chart uses
// #B88C3A (White) / #8A5A9E (Black) — in-band, CVD-separated, ≥3:1 on
// the card surface. The polarity charts (eval / win% / material) use a
// single gold data line; the above/below-midline fills are achromatic
// polarity cues labeled in text, not categorical series.
// =====================================================================
import { useMemo, useRef, useState } from "react";

import { winProbability } from "@/lib/analysis/accuracy";
import { materialBalanceFromFen } from "@/lib/analysis/review";
import { MATE_CP } from "@/lib/engine/uci";

import type { AnalysisSession } from "./useAnalysisSession";

const WHITE_SERIES = "#B88C3A";
const BLACK_SERIES = "#8A5A9E";
const GOLD_LINE = "rgb(212,175,55)";
const IVORY_FILL = "rgba(239,230,213,0.14)";
const DARK_FILL = "rgba(10,5,3,0.45)";

type Series = {
  label: string;
  color: string;
  /** One value per position index (null = gap). */
  values: (number | null)[];
};

type ChartSpec = {
  series: Series[];
  min: number;
  max: number;
  /** Draw a midline + polarity fills around this value. */
  midline?: number;
  format: (v: number) => string;
  /** Legend only renders for ≥ 2 series. */
  legend: boolean;
};

// ── Shared SVG chart ─────────────────────────────────────────────────

function PanelChart({
  spec,
  labels,
  currentIndex,
  onSeek,
}: {
  spec: ChartSpec;
  labels: string[];
  currentIndex: number;
  onSeek: (index: number) => void;
}) {
  const W = 420;
  const H = 120;
  const PAD = { top: 8, bottom: 6, left: 4, right: 4 };
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const n = labels.length;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) =>
    PAD.top + innerH - ((v - spec.min) / (spec.max - spec.min || 1)) * innerH;

  const indexFromEvent = (clientX: number): number | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || n === 0) return null;
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / innerW) * (n - 1));
    return Math.max(0, Math.min(n - 1, i));
  };

  const paths = useMemo(
    () =>
      spec.series.map((s) => {
        let d = "";
        let pen = false;
        s.values.forEach((v, i) => {
          if (v === null) {
            pen = false;
            return;
          }
          d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
          pen = true;
        });
        return d;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec, n],
  );

  // Polarity fills: area between the first series and the midline.
  const polarity = useMemo(() => {
    if (spec.midline === undefined || spec.series.length === 0) return null;
    const mid = y(spec.midline);
    const vals = spec.series[0].values;
    let above = `M${x(0)},${mid}`;
    let below = `M${x(0)},${mid}`;
    vals.forEach((v, i) => {
      const yy = v === null ? mid : y(v);
      above += ` L${x(i).toFixed(1)},${Math.min(mid, yy).toFixed(1)}`;
      below += ` L${x(i).toFixed(1)},${Math.max(mid, yy).toFixed(1)}`;
    });
    above += ` L${x(n - 1)},${mid} Z`;
    below += ` L${x(n - 1)},${mid} Z`;
    return { above, below, mid };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, n]);

  const active = hover ?? currentIndex;
  const activeClamped = Math.max(0, Math.min(n - 1, active));

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair select-none rounded-md"
        role="img"
        aria-label={`${spec.series.map((s) => s.label).join(" and ")} by move`}
        onPointerMove={(e) => setHover(indexFromEvent(e.clientX))}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => {
          const i = indexFromEvent(e.clientX);
          if (i !== null) onSeek(i);
        }}
      >
        <rect x={0} y={0} width={W} height={H} fill="rgba(255,255,255,0.02)" rx={6} />

        {polarity && (
          <>
            <path d={polarity.above} fill={IVORY_FILL} />
            <path d={polarity.below} fill={DARK_FILL} />
            <line
              x1={PAD.left}
              y1={polarity.mid}
              x2={W - PAD.right}
              y2={polarity.mid}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={1}
            />
          </>
        )}

        {spec.series.map((s, si) => (
          <path
            key={s.label}
            d={paths[si]}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ))}

        {/* Current position marker */}
        {n > 0 && (
          <line
            x1={x(currentIndex)}
            y1={PAD.top}
            x2={x(currentIndex)}
            y2={H - PAD.bottom}
            stroke="rgba(255,255,255,0.5)"
            strokeWidth={1}
          />
        )}

        {/* Crosshair */}
        {hover !== null && n > 0 && (
          <line
            x1={x(activeClamped)}
            y1={PAD.top}
            x2={x(activeClamped)}
            y2={H - PAD.bottom}
            stroke="rgba(212,175,55,0.6)"
            strokeWidth={1}
            strokeDasharray="3 2"
          />
        )}

        {spec.series.map((s) => {
          const v = s.values[activeClamped];
          if (v === null || v === undefined) return null;
          return (
            <circle
              key={s.label}
              cx={x(activeClamped)}
              cy={y(v)}
              r={3.5}
              fill={s.color}
              stroke="#1A0D0A"
              strokeWidth={1.5}
            />
          );
        })}
      </svg>

      {/* Tooltip */}
      {hover !== null && n > 0 && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[90px] rounded-md border border-gold/25 bg-background/95 px-2 py-1 text-[11px] shadow-lg"
          style={{
            left: `${(x(activeClamped) / W) * 100}%`,
            transform: activeClamped > n / 2 ? "translateX(-105%)" : "translateX(6px)",
          }}
        >
          <div className="font-medium text-foreground">{labels[activeClamped]}</div>
          {spec.series.map((s) => {
            const v = s.values[activeClamped];
            return (
              <div key={s.label} className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: s.color }}
                />
                {s.label}: {v === null || v === undefined ? "—" : spec.format(v)}
              </div>
            );
          })}
        </div>
      )}

      {spec.legend && (
        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
          {spec.series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {spec.midline !== undefined && (
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/70">
          <span>▲ White better</span>
          <span>▼ Black better</span>
        </div>
      )}
    </div>
  );
}

// ── Chart derivations ────────────────────────────────────────────────

type TabId = "eval" | "winprob" | "material" | "accuracy" | "time" | "depth";

export function AnalysisCharts({ session }: { session: AnalysisSession }) {
  const [tab, setTab] = useState<TabId>("eval");
  const { mainline, reviewState } = session;
  const review = reviewState.status === "done" ? reviewState.review : null;

  // Position labels: "Start", then "1. e4", "1… e5", …
  const labels = useMemo(
    () => [
      "Start",
      ...mainline.map((n) => `${n.moveNumber}${n.color === "w" ? "." : "…"} ${n.san}`),
    ],
    [mainline],
  );

  const material = useMemo(() => {
    if (mainline.length === 0) return [];
    const rootFen = session.tree.root.fenAfter;
    return [rootFen, ...mainline.map((n) => n.fenAfter)].map(materialBalanceFromFen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainline]);

  const clocks = useMemo(() => {
    // Per-move seconds spent, from [%clk] tags (null when absent).
    const bySide: Record<"w" | "b", number | null> = { w: null, b: null };
    const out: (number | null)[] = [null]; // start position
    for (const n of mainline) {
      if (n.clockSeconds === null) {
        out.push(null);
        continue;
      }
      const prev = bySide[n.color];
      out.push(prev !== null ? Math.max(0, prev - n.clockSeconds) : null);
      bySide[n.color] = n.clockSeconds;
    }
    return out;
  }, [mainline]);

  const hasClocks = clocks.some((c) => c !== null && c > 0);

  const spec: ChartSpec | null = useMemo(() => {
    switch (tab) {
      case "eval": {
        if (!review) return null;
        const clamp = (v: number) => Math.max(-600, Math.min(600, v));
        return {
          series: [
            {
              label: "Evaluation",
              color: GOLD_LINE,
              values: review.evals.map((v) =>
                clamp(Math.abs(v) >= MATE_CP / 2 ? Math.sign(v) * 600 : v),
              ),
            },
          ],
          min: -620,
          max: 620,
          midline: 0,
          format: (v) => `${v >= 0 ? "+" : ""}${(v / 100).toFixed(2)}`,
          legend: false,
        };
      }
      case "winprob": {
        if (!review) return null;
        return {
          series: [{ label: "White win %", color: GOLD_LINE, values: review.winProbabilities }],
          min: 0,
          max: 100,
          midline: 50,
          format: (v) => `${v.toFixed(0)}%`,
          legend: false,
        };
      }
      case "material": {
        if (material.length === 0) return null;
        const extent = Math.max(3, ...material.map((v) => Math.abs(v)));
        return {
          series: [{ label: "Material", color: GOLD_LINE, values: material }],
          min: -extent - 0.5,
          max: extent + 0.5,
          midline: 0,
          format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} pawns`,
          legend: false,
        };
      }
      case "accuracy": {
        if (!review) return null;
        const white: (number | null)[] = [null];
        const black: (number | null)[] = [null];
        for (const m of review.moves) {
          white.push(m.color === "w" ? m.accuracy : null);
          black.push(m.color === "b" ? m.accuracy : null);
        }
        // Bridge the gaps so each side draws a continuous line.
        const bridge = (vals: (number | null)[]) => {
          let last: number | null = null;
          return vals.map((v) => {
            if (v !== null) last = v;
            return last;
          });
        };
        return {
          series: [
            { label: "White", color: WHITE_SERIES, values: bridge(white) },
            { label: "Black", color: BLACK_SERIES, values: bridge(black) },
          ],
          min: 0,
          max: 105,
          format: (v) => `${v.toFixed(0)}%`,
          legend: true,
        };
      }
      case "time": {
        if (!hasClocks) return null;
        const max = Math.max(...clocks.map((c) => c ?? 0), 10);
        return {
          series: [{ label: "Seconds used", color: GOLD_LINE, values: clocks }],
          min: 0,
          max: max * 1.1,
          format: (v) => `${v.toFixed(0)}s`,
          legend: false,
        };
      }
      case "depth": {
        if (!review) return null;
        return {
          series: [
            {
              label: "Search depth",
              color: GOLD_LINE,
              values: [
                review.moves[0]?.evalBefore.depth ?? null,
                ...review.moves.map((m) => m.evalAfter.depth),
              ],
            },
          ],
          min: 0,
          max: Math.max(20, review.depth + 6),
          format: (v) => `depth ${v.toFixed(0)}`,
          legend: false,
        };
      }
    }
  }, [tab, review, material, clocks, hasClocks]);

  const tabs: { id: TabId; label: string; enabled: boolean }[] = [
    { id: "eval", label: "Eval", enabled: !!review },
    { id: "winprob", label: "Win %", enabled: !!review },
    { id: "material", label: "Material", enabled: material.length > 1 },
    { id: "accuracy", label: "Accuracy", enabled: !!review },
    { id: "time", label: "Time", enabled: hasClocks },
    { id: "depth", label: "Depth", enabled: !!review },
  ];

  const currentIndex = useMemo(() => {
    // Inside a variation, mark the deepest mainline ancestor so the
    // cursor stays anchored to where the side line branched off.
    let count = 0;
    for (const node of session.pathToCurrent) {
      if (!session.tree.isMainline(node.id)) break;
      count++;
    }
    return count;
  }, [session]);

  return (
    <section aria-label="Analysis charts">
      <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Chart type">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            disabled={!t.enabled}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              tab === t.id
                ? "bg-gold/20 text-gold"
                : t.enabled
                  ? "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  : "cursor-not-allowed text-muted-foreground/40"
            }`}
            title={t.enabled ? undefined : "Run a game review to unlock"}
          >
            {t.label}
          </button>
        ))}
      </div>

      {spec ? (
        <PanelChart
          spec={spec}
          labels={labels}
          currentIndex={Math.min(currentIndex, labels.length - 1)}
          onSeek={(i) => session.goToPly(i)}
        />
      ) : (
        <div className="rounded-md border border-dashed border-white/10 px-3 py-6 text-center text-xs text-muted-foreground">
          {mainline.length === 0
            ? "Import or play a game to see its graphs."
            : "Run a game review to unlock this chart."}
        </div>
      )}
    </section>
  );
}
