// =====================================================================
// ReviewPanel — full-game engine review
// ---------------------------------------------------------------------
// Launches the batch Stockfish review (with a depth choice), streams
// progress, then presents the report: per-side accuracy + ACPL, the
// classification tally, phase summaries and clickable critical moments.
// The per-move detail card for the current position lives here too.
// =====================================================================
import { useState } from "react";
import { Loader2, Play, Square } from "lucide-react";

import { REVIEW_DEPTH_DEFAULT } from "@/lib/analysis/gameAnalyzer";
import {
  CLASS_BG,
  CLASS_COLOR,
  CLASS_EXPLANATION,
  CLASS_ICON,
  CLASS_LABEL,
  CLASS_ORDER,
  type Classification,
} from "@/lib/chess/classification";
import { formatScore } from "@/lib/engine/uci";

import type { AnalysisSession } from "./useAnalysisSession";

const DEPTH_CHOICES = [
  { depth: 10, label: "Quick" },
  { depth: REVIEW_DEPTH_DEFAULT, label: "Standard" },
  { depth: 18, label: "Deep" },
];

function AccuracyCard({
  label,
  value,
  acpl,
}: {
  label: string;
  value: number | null;
  acpl: number | null;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-center">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl text-gold">
        {value === null ? "—" : `${value.toFixed(1)}%`}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {acpl === null ? "" : `${acpl} avg. centipawn loss`}
      </div>
    </div>
  );
}

function evalPointText(cpWhite: number, mateIn: number | null): string {
  if (mateIn !== null) return mateIn === 0 ? "#" : mateIn > 0 ? `M${mateIn}` : `-M${-mateIn}`;
  return formatScore({ type: "cp", value: cpWhite });
}

export function ReviewPanel({ session }: { session: AnalysisSession }) {
  const [depth, setDepth] = useState(REVIEW_DEPTH_DEFAULT);
  const { reviewState, mainline } = session;

  const review = reviewState.status === "done" ? reviewState.review : null;
  const currentAnalysis =
    session.currentNode.parentId !== null ? session.analysisFor(session.currentNode) : null;

  return (
    <section aria-label="Game review" className="space-y-3">
      {/* Launcher */}
      {reviewState.status !== "running" && (
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex overflow-hidden rounded-lg border border-white/10"
            role="radiogroup"
            aria-label="Review depth"
          >
            {DEPTH_CHOICES.map((c) => (
              <button
                key={c.depth}
                type="button"
                role="radio"
                aria-checked={depth === c.depth}
                onClick={() => setDepth(c.depth)}
                className={`px-2.5 py-1.5 text-xs transition-colors ${
                  depth === c.depth
                    ? "bg-gold/20 text-gold"
                    : "text-muted-foreground hover:bg-white/5"
                }`}
              >
                {c.label}
                <span className="ml-1 text-[9px] opacity-60">d{c.depth}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void session.runReview(depth)}
            disabled={mainline.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-gold/20 px-3 py-1.5 text-xs font-medium text-gold transition-colors hover:bg-gold/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" />
            {review ? "Re-run review" : "Review game"}
          </button>
        </div>
      )}

      {/* Progress */}
      {reviewState.status === "running" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />
              Reviewing… {reviewState.progress.done}/{reviewState.progress.total} positions
            </span>
            <button
              type="button"
              onClick={session.cancelReview}
              className="flex items-center gap-1 rounded px-2 py-1 text-muted-foreground hover:bg-white/5 hover:text-red-400"
            >
              <Square className="h-3 w-3" /> Stop
            </button>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-white/5"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={reviewState.progress.total}
            aria-valuenow={reviewState.progress.done}
          >
            <div
              className="h-full rounded-full bg-gold transition-all duration-300"
              style={{
                width: `${(reviewState.progress.done / Math.max(1, reviewState.progress.total)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {reviewState.status === "error" && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
          {reviewState.message}
        </p>
      )}

      {/* Current move detail */}
      {currentAnalysis && (
        <div
          className={`rounded-lg border border-white/10 p-3 ${CLASS_BG[currentAnalysis.classification]}`}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-medium">
              {session.currentNode.moveNumber}
              {session.currentNode.color === "w" ? "." : "…"} {currentAnalysis.san}
            </span>
            <span className={`text-xs font-bold ${CLASS_COLOR[currentAnalysis.classification]}`}>
              {CLASS_ICON[currentAnalysis.classification]}{" "}
              {CLASS_LABEL[currentAnalysis.classification]}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {CLASS_EXPLANATION[currentAnalysis.classification]}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px]">
            <div>
              <div className="text-muted-foreground">Before</div>
              <div className="font-mono text-foreground">
                {evalPointText(
                  currentAnalysis.evalBefore.cpWhite,
                  currentAnalysis.evalBefore.mateIn,
                )}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">After</div>
              <div className="font-mono text-foreground">
                {evalPointText(currentAnalysis.evalAfter.cpWhite, currentAnalysis.evalAfter.mateIn)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Loss</div>
              <div className="font-mono text-foreground">
                {currentAnalysis.cpl > 0 ? `${currentAnalysis.cpl}cp` : "0"}
              </div>
            </div>
          </div>
          {currentAnalysis.bestSan && currentAnalysis.bestSan !== currentAnalysis.san && (
            <div className="mt-2 border-t border-white/10 pt-2 text-[11px]">
              <span className="text-muted-foreground">Best was </span>
              <span className="font-mono text-gold">{currentAnalysis.bestSan}</span>
              {currentAnalysis.bestLineSan.length > 1 && (
                <span className="ml-1 font-mono text-muted-foreground/80">
                  ({currentAnalysis.bestLineSan.join(" ")})
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Report */}
      {review && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <AccuracyCard
              label="White accuracy"
              value={review.accuracyWhite}
              acpl={review.acplWhite}
            />
            <AccuracyCard
              label="Black accuracy"
              value={review.accuracyBlack}
              acpl={review.acplBlack}
            />
          </div>

          {/* Classification tally */}
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-x-4 text-[11px] text-muted-foreground">
              <span />
              <span className="w-8 text-center">White</span>
              <span className="w-8 text-center">Black</span>
            </div>
            <div className="space-y-0.5">
              {CLASS_ORDER.filter(
                (c) =>
                  (review.classCountsWhite[c] ?? 0) > 0 || (review.classCountsBlack[c] ?? 0) > 0,
              ).map((c: Classification) => (
                <div
                  key={c}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 text-xs"
                >
                  <span className={`flex items-center gap-1.5 ${CLASS_COLOR[c]}`}>
                    <span className="w-5 text-center font-bold">{CLASS_ICON[c]}</span>
                    {CLASS_LABEL[c]}
                  </span>
                  <span className="w-8 text-center tabular-nums text-foreground">
                    {review.classCountsWhite[c] ?? 0}
                  </span>
                  <span className="w-8 text-center tabular-nums text-foreground">
                    {review.classCountsBlack[c] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Phase summaries */}
          <div className="space-y-1.5">
            {review.phases.map((p) => (
              <div
                key={p.phase}
                className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize text-foreground">{p.phase}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {p.accuracyWhite !== null && `W ${Math.round(p.accuracyWhite)}%`}
                    {p.accuracyWhite !== null && p.accuracyBlack !== null && " · "}
                    {p.accuracyBlack !== null && `B ${Math.round(p.accuracyBlack)}%`}
                  </span>
                </div>
                <p className="mt-0.5 text-muted-foreground">{p.comment}</p>
              </div>
            ))}
          </div>

          {/* Critical moments */}
          {review.criticalMoments.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Key moments
              </div>
              <div className="space-y-1">
                {review.criticalMoments.map((m) => (
                  <button
                    key={m.ply}
                    type="button"
                    onClick={() => session.goToPly(m.ply)}
                    className="flex w-full items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-left text-xs transition-colors hover:border-gold/25 hover:bg-gold/5"
                  >
                    <span className={`w-6 text-center font-bold ${CLASS_COLOR[m.classification]}`}>
                      {CLASS_ICON[m.classification]}
                    </span>
                    <span className="min-w-0 flex-1 text-muted-foreground">{m.description}</span>
                    <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground/60">
                      ±{Math.round(m.swing)}%
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-right text-[10px] text-muted-foreground/60">
            Reviewed at depth {review.depth}
            {review.openingName && ` · ${review.openingEco} ${review.openingName}`}
          </p>
        </>
      )}
    </section>
  );
}
