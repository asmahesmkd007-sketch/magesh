import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Play,
  Pause,
  RotateCcw,
  ArrowLeft,
  LineChart,
  Crown,
  Loader2,
} from "lucide-react";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { InteractiveBoard } from "@/components/site/InteractiveBoard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/game/$id/review")({
  head: () => ({ meta: [{ title: "Game Replay — ChessOx" }] }),
  component: GameReview,
});

type GameRow = {
  id: string;
  white_id: string | null;
  black_id: string | null;
  white_username: string | null;
  black_username: string | null;
  white_rating: number | null;
  black_rating: number | null;
  pgn: string | null;
  result: string;
  end_reason: string | null;
  time_class: string;
  time_control: string;
  is_rated: boolean;
  ended_at: string | null;
  created_at: string;
  vs_computer: boolean;
};

type MoveRow = { ply: number; san: string; uci: string; fen_after: string };

const PIECE_UNICODE: Record<string, Record<string, string>> = {
  w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
};
const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function CapturedPieces({
  current,
  orientation,
}: {
  current: Chess;
  orientation: "w" | "b";
}) {
  const captured = useMemo(() => {
    const initial = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const remaining: Record<"w" | "b", Record<string, number>> = { w: { ...initial }, b: { ...initial } };
    for (const row of current.board()) {
      for (const cell of row) {
        if (!cell) continue;
        const color = cell.color as "w" | "b";
        const type = cell.type;
        if (type !== "k" && remaining[color][type] !== undefined) {
          remaining[color][type]--;
        }
      }
    }
    // captured[color] = pieces of that color that white/black captured
    const whiteCaptured: string[] = [];
    const blackCaptured: string[] = [];
    for (const [type, count] of Object.entries(remaining.b)) {
      for (let i = 0; i < Math.max(0, count); i++) whiteCaptured.push(type);
    }
    for (const [type, count] of Object.entries(remaining.w)) {
      for (let i = 0; i < Math.max(0, count); i++) blackCaptured.push(type);
    }
    whiteCaptured.sort((a, b) => PIECE_VALUE[b] - PIECE_VALUE[a]);
    blackCaptured.sort((a, b) => PIECE_VALUE[b] - PIECE_VALUE[a]);
    const materialAdv = whiteCaptured.reduce((s, p) => s + PIECE_VALUE[p], 0) -
      blackCaptured.reduce((s, p) => s + PIECE_VALUE[p], 0);
    return { whiteCaptured, blackCaptured, materialAdv };
  }, [current]);

  const top = orientation === "w" ? "black" : "white";
  const bottom = orientation === "w" ? "white" : "black";
  const topPieces = top === "white" ? captured.whiteCaptured : captured.blackCaptured;
  const bottomPieces = bottom === "white" ? captured.whiteCaptured : captured.blackCaptured;
  const captureColor = top === "white" ? "b" : "w"; // color of pieces captured BY top player
  const bottomCaptureColor = bottom === "white" ? "b" : "w";

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex items-center gap-1 min-h-[20px]">
        {topPieces.map((p, i) => (
          <span key={i} className="text-base leading-none">{PIECE_UNICODE[captureColor][p]}</span>
        ))}
        {captured.materialAdv < 0 && (
          <span className="text-xs text-muted-foreground ml-1">+{Math.abs(captured.materialAdv)}</span>
        )}
      </div>
      <div className="flex items-center gap-1 min-h-[20px]">
        {bottomPieces.map((p, i) => (
          <span key={i} className="text-base leading-none">{PIECE_UNICODE[bottomCaptureColor][p]}</span>
        ))}
        {captured.materialAdv > 0 && (
          <span className="text-xs text-muted-foreground ml-1">+{captured.materialAdv}</span>
        )}
      </div>
    </div>
  );
}

function outcomeLabel(game: GameRow, userId: string | undefined): string {
  if (game.result === "draw") return "Draw";
  const userIsWhite = userId && game.white_id === userId;
  const userIsBlack = userId && game.black_id === userId;
  if (game.result === "white") {
    if (userIsWhite) return "You Won";
    if (userIsBlack) return "You Lost";
    return "White Won";
  }
  if (game.result === "black") {
    if (userIsBlack) return "You Won";
    if (userIsWhite) return "You Lost";
    return "Black Won";
  }
  return "Finished";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function GameReview() {
  const { id } = useParams({ from: "/game/$id/review" });
  const { user } = useAuth();
  const navigate = useNavigate();

  const [game, setGame] = useState<GameRow | null>(null);
  const [sans, setSans] = useState<string[]>([]);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load game + moves
  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: g, error: ge }, { data: m }] = await Promise.all([
        supabase.from("games").select("*").eq("id", id).maybeSingle(),
        supabase.from("game_moves").select("ply,san,uci,fen_after").eq("game_id", id).order("ply"),
      ]);

      if (!alive) return;
      if (ge || !g) { setError("Game not found."); setLoading(false); return; }

      const gameRow = g as GameRow;
      setGame(gameRow);

      if (user) {
        if (gameRow.black_id === user.id) setOrientation("b");
        else setOrientation("w");
      }

      let moveSans: string[] = [];
      if (m && m.length > 0) {
        moveSans = (m as MoveRow[]).map((r) => r.san);
      } else if (gameRow.pgn) {
        try {
          const chess = new Chess();
          chess.loadPgn(gameRow.pgn);
          moveSans = chess.history();
        } catch { /* PGN parse failed */ }
      }

      setSans(moveSans);
      setPly(moveSans.length);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [id, user]);

  // Arrow-key navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); setPlaying(false); setPly((p) => Math.max(0, p - 1)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setPlaying(false); setPly((p) => Math.min(sans.length, p + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setPlaying(false); setPly(0); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setPlaying(false); setPly(sans.length); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sans.length]);

  // Autoplay
  useEffect(() => {
    if (playing) {
      autoPlayRef.current = setInterval(() => {
        setPly((p) => {
          if (p >= sans.length) { setPlaying(false); return p; }
          return p + 1;
        });
      }, 1200);
    } else {
      if (autoPlayRef.current) { clearInterval(autoPlayRef.current); autoPlayRef.current = null; }
    }
    return () => { if (autoPlayRef.current) { clearInterval(autoPlayRef.current); autoPlayRef.current = null; } };
  }, [playing, sans.length]);

  const current = useMemo(() => {
    const chess = new Chess();
    for (let i = 0; i < ply; i++) {
      try { chess.move(sans[i]); } catch { break; }
    }
    return chess;
  }, [sans, ply]);

  const lastMove = useMemo(() => {
    const h = current.history({ verbose: true });
    const last = h[h.length - 1];
    return last ? { from: last.from, to: last.to } : null;
  }, [current]);

  const checkSquare = useMemo(() => {
    if (!current.inCheck()) return null;
    const turn = current.turn();
    for (const row of current.board())
      for (const cell of row)
        if (cell && cell.type === "k" && cell.color === turn) return cell.square;
    return null;
  }, [current]);

  const movePairs: [string, string | undefined][] = [];
  for (let i = 0; i < sans.length; i += 2) movePairs.push([sans[i], sans[i + 1]]);

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  if (error || !game) {
    return (
      <PageShell title="Game Not Found">
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">{error ?? "This game does not exist."}</p>
          <div className="mt-6">
            <Link to="/play/history">
              <GoldButton><ArrowLeft className="h-4 w-4" /> Back to History</GoldButton>
            </Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  const outcome = outcomeLabel(game, user?.id);

  return (
    <PageShell>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.26em] text-gold/70">Game Replay</div>
          <h1 className="mt-1 font-display text-3xl">
            {game.white_username ?? "White"} vs {game.black_username ?? "Black"}
          </h1>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="capitalize">{game.time_class} · {game.time_control}</span>
            {game.is_rated && <span className="rounded px-1.5 py-0.5 bg-white/5">Rated</span>}
            {game.ended_at && <span>{fmtDate(game.ended_at)}</span>}
            <span className="font-medium text-gold capitalize">
              {outcome} — {game.end_reason ?? game.result}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/play/history">
            <GhostButton><ArrowLeft className="h-4 w-4" /> History</GhostButton>
          </Link>
          <GoldButton onClick={() => navigate({ to: "/analysis", search: { gameId: id } })}>
            <LineChart className="h-4 w-4" /> Analyze
          </GoldButton>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Board column */}
        <div className="lg:col-span-7">
          {/* Top player's captured pieces */}
          <div className="mb-1 px-1">
            <CapturedPieces current={current} orientation={orientation} />
          </div>

          <InteractiveBoard
            board={current.board()}
            orientation={orientation}
            selected={null}
            targets={[]}
            lastMove={lastMove}
            checkSquare={checkSquare ?? undefined}
            onSquare={() => {}}
            disabled
          />

          {/* Bottom player's captured pieces */}
          <div className="mt-1 px-1">
            <CapturedPieces current={current} orientation={orientation === "w" ? "b" : "w"} />
          </div>

          {/* Move slider */}
          {sans.length > 0 && (
            <div className="mt-2 px-1">
              <input
                type="range"
                min={0}
                max={sans.length}
                value={ply}
                onChange={(e) => { setPlaying(false); setPly(Number(e.target.value)); }}
                className="w-full accent-gold cursor-pointer"
              />
            </div>
          )}

          {/* Navigation controls */}
          <div className="mt-2 flex items-center justify-center gap-2">
            <GhostButton onClick={() => { setPlaying(false); setPly(0); }} aria-label="First move">
              <ChevronsLeft className="h-4 w-4" />
            </GhostButton>
            <GhostButton
              onClick={() => { setPlaying(false); setPly((p) => Math.max(0, p - 1)); }}
              aria-label="Previous move"
            >
              <ChevronLeft className="h-4 w-4" />
            </GhostButton>
            <GhostButton
              onClick={() => {
                if (ply >= sans.length) setPly(0);
                setPlaying((p) => !p);
              }}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </GhostButton>
            <span className="w-20 text-center text-sm tabular-nums text-muted-foreground">
              {ply} / {sans.length}
            </span>
            <GhostButton
              onClick={() => { setPlaying(false); setPly((p) => Math.min(sans.length, p + 1)); }}
              aria-label="Next move"
            >
              <ChevronRight className="h-4 w-4" />
            </GhostButton>
            <GhostButton onClick={() => { setPlaying(false); setPly(sans.length); }} aria-label="Last move">
              <ChevronsRight className="h-4 w-4" />
            </GhostButton>
          </div>

          <div className="mt-2 flex justify-center gap-4">
            <button
              onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Flip Board
            </button>
            <span className="text-xs text-muted-foreground">← → arrow keys to navigate</span>
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4 lg:col-span-5">
          {/* Result card */}
          <Card className="p-5 text-center">
            <Crown className="mx-auto h-6 w-6 text-gold" />
            <div className="mt-2 font-display text-2xl text-gradient-gold">{outcome}</div>
            {game.end_reason && (
              <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground capitalize">
                {game.end_reason}
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="text-xs text-muted-foreground">♔ White</div>
                <div className="mt-1 font-display">{game.white_username ?? "—"}</div>
                {game.white_rating && <div className="text-xs text-gold">{game.white_rating}</div>}
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="text-xs text-muted-foreground">♚ Black</div>
                <div className="mt-1 font-display">{game.black_username ?? "—"}</div>
                {game.black_rating && <div className="text-xs text-gold">{game.black_rating}</div>}
              </div>
            </div>
          </Card>

          {/* Move list */}
          <Card className="p-5">
            <div className="mb-3 font-display">Moves</div>
            {sans.length === 0 ? (
              <p className="text-xs text-muted-foreground">No move data recorded for this game.</p>
            ) : (
              <div className="grid max-h-[340px] grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 overflow-y-auto pr-2 text-sm scrollbar-thin">
                {movePairs.map((pair, i) => (
                  <div className="contents" key={i}>
                    <div className="text-muted-foreground">{i + 1}.</div>
                    <button
                      type="button"
                      onClick={() => setPly(i * 2 + 1)}
                      className={`rounded px-1 text-left hover:bg-white/5 ${
                        ply === i * 2 + 1 ? "bg-gold/15 text-gold" : ""
                      }`}
                    >
                      {pair[0]}
                    </button>
                    {pair[1] ? (
                      <button
                        type="button"
                        onClick={() => setPly(i * 2 + 2)}
                        className={`rounded px-1 text-left text-muted-foreground hover:bg-white/5 ${
                          ply === i * 2 + 2 ? "bg-gold/15 text-gold" : ""
                        }`}
                      >
                        {pair[1]}
                      </button>
                    ) : (
                      <div />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
