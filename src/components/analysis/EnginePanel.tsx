// =====================================================================
// EnginePanel — live Stockfish output and controls
// ---------------------------------------------------------------------
// Shows the engine status line (depth / nodes / nps), the MultiPV
// candidate lines with evals and click-to-play SAN previews, and a
// settings drawer for MultiPV, depth cap, threads and hash. All engine
// interaction goes through useEngine; this component is presentation
// plus a thin bit of SAN conversion for the PVs.
// =====================================================================
import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { ChevronDown, Cpu, Settings2 } from "lucide-react";

import type { UseEngine } from "@/hooks/useEngine";
import { pvToSan } from "@/lib/analysis/gameAnalyzer";
import { ENGINE_LIMITS, supportsThreads } from "@/lib/engine/stockfishEngine";
import { formatScore, scoreForWhite, type UciInfoLine } from "@/lib/engine/uci";

type Props = {
  engine: UseEngine;
  engineOn: boolean;
  onToggleEngine: (on: boolean) => void;
  /** FEN the panel's lines refer to (the current board position). */
  fen: string;
  /** Play the first move of a candidate line on the board. */
  onPlayUci: (uci: string) => void;
};

function fmtNodes(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(n);
}

function LineRow({
  line,
  fen,
  turn,
  onPlayUci,
}: {
  line: UciInfoLine;
  fen: string;
  turn: "w" | "b";
  onPlayUci: (uci: string) => void;
}) {
  const whiteScore = scoreForWhite(line.score, turn);
  const sans = useMemo(() => pvToSan(fen, line.pv, 10), [fen, line.pv]);
  const startNumber = useMemo(() => {
    const parts = fen.split(" ");
    return { num: Number(parts[5]) || 1, blackFirst: parts[1] === "b" };
  }, [fen]);

  const scoreText = formatScore(whiteScore);
  const positive = whiteScore.type === "mate" ? whiteScore.value > 0 : whiteScore.value >= 0;

  return (
    <button
      type="button"
      onClick={() => line.pv[0] && onPlayUci(line.pv[0])}
      className="group flex w-full items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-left transition-colors hover:border-gold/25 hover:bg-gold/5"
      title="Play the first move of this line"
    >
      <span
        className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-bold ${
          positive
            ? "bg-[#EFE6D5] text-[#26150F]"
            : "bg-[#26150F] text-[#EFE6D5] border border-white/10"
        }`}
      >
        {scoreText}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs leading-6 text-muted-foreground group-hover:text-foreground">
        {sans.map((san, i) => {
          // Number white's moves; open with "N..." when Black moves first.
          let num = "";
          if (startNumber.blackFirst) {
            if (i === 0) num = `${startNumber.num}... `;
            else if (i % 2 === 1) num = `${startNumber.num + (i + 1) / 2}. `;
          } else if (i % 2 === 0) {
            num = `${startNumber.num + i / 2}. `;
          }
          return (
            <span key={i}>
              {num}
              {san}{" "}
            </span>
          );
        })}
      </span>
      <span className="mt-0.5 shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
        d{line.depth}
      </span>
    </button>
  );
}

export function EnginePanel({ engine, engineOn, onToggleEngine, fen, onPlayUci }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { snapshot, status, settings, updateSettings } = engine;

  const turn = (fen.split(" ")[1] as "w" | "b") ?? "w";
  const lines = snapshot?.fen === fen ? snapshot.lines.filter(Boolean) : [];
  const top = lines[0];

  const statusText = !engineOn
    ? "Engine off"
    : status === "loading"
      ? "Loading Stockfish…"
      : status === "error"
        ? "Engine failed to start"
        : status === "searching"
          ? "Analysing"
          : "Ready";

  return (
    <section aria-label="Engine analysis" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-gold" aria-hidden="true" />
          <span className="font-display text-sm">Stockfish 18</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
              status === "error"
                ? "bg-red-500/15 text-red-400"
                : engineOn && status === "searching"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-white/5 text-muted-foreground"
            }`}
          >
            {statusText}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            aria-label="Engine settings"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-gold"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={engineOn}
            onClick={() => onToggleEngine(!engineOn)}
            className={`relative h-5 w-9 rounded-full transition-colors ${engineOn ? "bg-gold/80" : "bg-white/10"}`}
            aria-label="Toggle engine"
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform ${engineOn ? "translate-x-4" : "translate-x-0.5"}`}
            />
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs">
          <label className="space-y-1">
            <span className="text-muted-foreground">Lines (MultiPV): {settings.multiPv}</span>
            <input
              type="range"
              min={ENGINE_LIMITS.multiPv.min}
              max={ENGINE_LIMITS.multiPv.max}
              value={settings.multiPv}
              onChange={(e) => updateSettings({ multiPv: Number(e.target.value) })}
              className="w-full accent-gold"
            />
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground">
              Depth cap: {settings.depthLimit === 0 ? "∞" : settings.depthLimit}
            </span>
            <input
              type="range"
              min={0}
              max={ENGINE_LIMITS.depth.max}
              value={settings.depthLimit}
              onChange={(e) => updateSettings({ depthLimit: Number(e.target.value) })}
              className="w-full accent-gold"
            />
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground">
              Threads: {settings.threads}
              {!supportsThreads() && " (single-core build)"}
            </span>
            <input
              type="range"
              min={ENGINE_LIMITS.threads.min}
              max={ENGINE_LIMITS.threads.max}
              value={settings.threads}
              disabled={!supportsThreads()}
              onChange={(e) => updateSettings({ threads: Number(e.target.value) })}
              className="w-full accent-gold disabled:opacity-40"
            />
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground">Hash: {settings.hash} MB</span>
            <input
              type="range"
              min={ENGINE_LIMITS.hash.min}
              max={ENGINE_LIMITS.hash.max}
              step={16}
              value={settings.hash}
              onChange={(e) => updateSettings({ hash: Number(e.target.value) })}
              className="w-full accent-gold"
            />
          </label>
        </div>
      )}

      {engineOn && (
        <>
          {/* Status line: depth / nodes / nps */}
          <div className="flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
            <span>depth {top?.depth ?? "—"}</span>
            <span>{fmtNodes(top?.nodes ?? null)} nodes</span>
            <span>{fmtNodes(top?.nps ?? null)} n/s</span>
            {top?.score.type === "mate" && (
              <span className="font-semibold text-gold">Mate in {Math.abs(top.score.value)}</span>
            )}
          </div>

          <div className="space-y-1.5" aria-live="polite">
            {lines.length === 0 ? (
              <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground">
                {status === "error" ? (
                  <span className="flex items-center justify-between gap-2">
                    Stockfish could not start — the analysis tools still work without live
                    evaluation.
                    <button
                      type="button"
                      onClick={engine.restart}
                      className="shrink-0 rounded-md border border-gold/30 px-2 py-1 text-gold transition-colors hover:bg-gold/10"
                    >
                      Retry
                    </button>
                  </span>
                ) : new Chess(fen).isGameOver() ? (
                  "Game over — no moves to analyse."
                ) : (
                  "Waiting for engine…"
                )}
              </div>
            ) : (
              lines
                .slice(0, settings.multiPv)
                .map((line) => (
                  <LineRow
                    key={line.multipv}
                    line={line}
                    fen={fen}
                    turn={turn}
                    onPlayUci={onPlayUci}
                  />
                ))
            )}
          </div>
        </>
      )}

      {!engineOn && (
        <button
          type="button"
          onClick={() => onToggleEngine(true)}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-white/10 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-gold/30 hover:text-gold"
        >
          <ChevronDown className="h-3 w-3" /> Turn the engine on to see live analysis
        </button>
      )}
    </section>
  );
}
