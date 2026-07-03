import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { RotateCcw, FlipVertical2, Flag, ArrowLeft } from "lucide-react";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { InteractiveBoard, type BoardCell } from "@/components/site/InteractiveBoard";
import { CapturedPieces } from "@/components/site/CapturedPieces";
import { PromotionPicker } from "@/components/site/PromotionPicker";
import { useBoardSettings, BOARD_THEMES, PIECE_SETS } from "@/hooks/useBoardSettings";
import { useAuth } from "@/hooks/useAuth";
import { saveLocalGame } from "@/lib/api/gameClient";

export const Route = createFileRoute("/play/local")({
  head: () => ({ meta: [{ title: "Local Play — ChessOx" }] }),
  component: LocalPlay,
});

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, "0")}`;

const TIME_CONTROLS = [
  { label: "No timer", sec: 0 },
  { label: "1 min", sec: 60 },
  { label: "3+0", sec: 180 },
  { label: "5+0", sec: 300 },
  { label: "10+0", sec: 600 },
  { label: "15+10", sec: 900, inc: 10 },
];

type Phase = "setup" | "playing" | "over";

function LocalPlay() {
  const { settings } = useBoardSettings();
  const colors = BOARD_THEMES[settings.boardTheme];
  const pieces = PIECE_SETS[settings.pieceTheme];
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("setup");
  const [tcIdx, setTcIdx] = useState(0);
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [selected, setSelected] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [whiteTime, setWhiteTime] = useState(0);
  const [blackTime, setBlackTime] = useState(0);

  const gameRef = useRef(new Chess());
  const [boardState, setBoardState] = useState<BoardCell[][]>(gameRef.current.board());
  const tcRef = useRef(TIME_CONTROLS[0]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const savedRef = useRef(false);

  const tc = TIME_CONTROLS[tcIdx];

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function startTimer(color: "w" | "b") {
    stopTimer();
    if (!tcRef.current.sec) return;
    timerRef.current = setInterval(() => {
      if (color === "w") {
        setWhiteTime((t) => {
          if (t <= 0) {
            stopTimer();
            endGame("Black wins on time");
            return 0;
          }
          return t - 1;
        });
      } else {
        setBlackTime((t) => {
          if (t <= 0) {
            stopTimer();
            endGame("White wins on time");
            return 0;
          }
          return t - 1;
        });
      }
    }, 1000);
  }

  function endGame(msg: string) {
    stopTimer();
    setResult(msg);
    setPhase("over");
    if (!savedRef.current) {
      savedRef.current = true;
      persistGame(msg);
    }
  }

  function persistGame(msg: string) {
    if (!user) return;
    const game = gameRef.current;
    const history = game.history({ verbose: true });
    if (history.length === 0) return;

    let result: "white" | "black" | "draw";
    let endReason: string;
    if (msg.includes("checkmate")) {
      result = msg.startsWith("White") ? "white" : "black";
      endReason = "checkmate";
    } else if (msg.toLowerCase().includes("time")) {
      result = msg.startsWith("White") ? "white" : "black";
      endReason = "timeout";
    } else if (msg.includes("resignation")) {
      result = msg.startsWith("White") ? "white" : "black";
      endReason = "resignation";
    } else {
      result = "draw";
      endReason = msg.toLowerCase().includes("stalemate") ? "stalemate" : "agreement";
    }

    // Replay the game to collect per-move FEN data and flags
    const replay = new Chess();
    const moves = history.map((m, idx) => {
      const fenBefore = replay.fen();
      replay.move({ from: m.from, to: m.to, promotion: m.promotion });
      return {
        ply: idx + 1,
        san: m.san,
        uci: m.from + m.to + (m.promotion ?? ""),
        fen_before: fenBefore,
        fen_after: replay.fen(),
        is_capture: !!m.captured,
        is_check: replay.inCheck(),
        is_promotion: !!m.promotion,
        is_castling: m.flags.includes("k") || m.flags.includes("q"),
      };
    });

    const pgn = (() => {
      const g = new Chess();
      for (const m of history) g.move({ from: m.from, to: m.to, promotion: m.promotion });
      return g.pgn();
    })();

    saveLocalGame({
      myColor: "w",
      opponentName: "Local Opponent",
      result,
      endReason,
      pgn,
      movesCount: history.length,
      finalFen: gameRef.current.fen(),
      moves,
    }).catch(() => {
      /* silent — not critical */
    });
  }

  function beginGame() {
    tcRef.current = tc;
    gameRef.current = new Chess();
    savedRef.current = false;
    setBoardState(gameRef.current.board());
    setSelected(null);
    setTargets([]);
    setLastMove(null);
    setHistory([]);
    setResult(null);
    setWhiteTime(tc.sec);
    setBlackTime(tc.sec);
    setPhase("playing");
    startTimer("w");
    if (settings.autoFlip) setOrientation("w");
  }

  function resetGame() {
    stopTimer();
    setPhase("setup");
  }

  useEffect(() => () => stopTimer(), []);

  function handleSquare(sq: string) {
    if (phase !== "playing" || promotion) return;
    const g = gameRef.current;
    const square = sq as Square;
    if (selected) {
      const moveList = g.moves({ square: selected as Square, verbose: true });
      const m = moveList.find((mv) => mv.to === square);
      if (m) {
        if (m.flags.includes("p")) {
          setPromotion({ from: selected, to: square });
          return;
        }
        commitMove(selected, square, undefined);
        return;
      }
    }
    const piece = g.get(square);
    if (piece && piece.color === g.turn()) {
      setSelected(sq);
      setTargets(g.moves({ square, verbose: true }).map((mv) => mv.to));
    } else {
      setSelected(null);
      setTargets([]);
    }
  }

  function commitMove(from: string, to: string, promo?: "q" | "r" | "b" | "n") {
    const g = gameRef.current;
    const m = g.move({ from, to, promotion: promo });
    if (!m) return;

    // Add increment
    const inc = (tcRef.current as { inc?: number }).inc ?? 0;
    if (m.color === "w" && tcRef.current.sec)
      setWhiteTime((t) => Math.min(t + inc, tcRef.current.sec));
    if (m.color === "b" && tcRef.current.sec)
      setBlackTime((t) => Math.min(t + inc, tcRef.current.sec));

    setBoardState([...g.board()]);
    setLastMove({ from, to });
    setSelected(null);
    setTargets([]);
    setHistory(g.history());

    if (g.isCheckmate()) {
      endGame(`${m.color === "w" ? "White" : "Black"} wins by checkmate`);
      return;
    }
    if (g.isDraw()) {
      endGame("Draw");
      return;
    }
    if (g.isStalemate()) {
      endGame("Stalemate — Draw");
      return;
    }

    const nextTurn = g.turn();
    if (settings.autoFlip) setOrientation(nextTurn);
    startTimer(nextTurn);
  }

  const checkSquare = useMemo(() => {
    const g = gameRef.current;
    if (!g.inCheck()) return null;
    return (
      g
        .board()
        .flat()
        .find((p) => p && p.type === "k" && p.color === g.turn())?.square ?? null
    );
  }, [boardState]);

  const turn = gameRef.current.turn();

  return (
    <PageShell
      eyebrow="Local Play"
      title="Two Player"
      subtitle="Both players on the same device — pass and play."
    >
      {phase === "setup" && (
        <div className="mx-auto max-w-lg">
          <Card className="p-8">
            <div className="mb-6 text-xs uppercase tracking-[0.22em] text-gold/80">
              Time Control
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TIME_CONTROLS.map((t, i) => (
                <button
                  key={t.label}
                  onClick={() => setTcIdx(i)}
                  className={`rounded-xl border py-2.5 text-sm transition ${i === tcIdx ? "border-gold bg-gold/10 text-gold" : "border-white/10 hover:border-gold/30"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="mt-8 flex gap-3">
              <GoldButton className="flex-1" onClick={beginGame}>
                Start Game
              </GoldButton>
              <Link to="/play">
                <GhostButton>
                  <ArrowLeft className="h-4 w-4" />
                </GhostButton>
              </Link>
            </div>
          </Card>
        </div>
      )}

      {(phase === "playing" || phase === "over") && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left panel */}
          <div className="space-y-4 lg:col-span-3">
            {/* Opponent clock (top) */}
            <PlayerCard
              name={orientation === "w" ? "Black" : "White"}
              time={orientation === "w" ? blackTime : whiteTime}
              active={phase === "playing" && turn !== orientation}
              showClock={!!tc.sec}
              board={boardState}
              capturedColor={orientation === "w" ? "b" : "w"}
            />
            {/* My clock (bottom) */}
            <PlayerCard
              name={orientation === "w" ? "White" : "Black"}
              time={orientation === "w" ? whiteTime : blackTime}
              active={phase === "playing" && turn === orientation}
              showClock={!!tc.sec}
              board={boardState}
              capturedColor={orientation === "w" ? "w" : "b"}
              me
            />

            {phase === "over" && result && (
              <Card className="p-4 text-center">
                <div className="font-display text-xl text-gradient-gold">{result}</div>
                <div className="mt-4 flex justify-center gap-2">
                  <GoldButton onClick={beginGame}>Rematch</GoldButton>
                  <GhostButton onClick={resetGame}>New Setup</GhostButton>
                </div>
              </Card>
            )}

            {phase === "playing" && (
              <Card className="p-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs hover:border-gold/30"
                  >
                    <FlipVertical2 className="h-3.5 w-3.5" /> Flip
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm("Resign?")) return;
                      endGame(`${turn === "w" ? "Black" : "White"} wins by resignation`);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <Flag className="h-3.5 w-3.5" /> Resign
                  </button>
                  <button
                    onClick={resetGame}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs hover:border-gold/30"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> New Game
                  </button>
                </div>
              </Card>
            )}
          </div>

          {/* Board */}
          <div className="lg:col-span-6">
            <div className="relative">
              <InteractiveBoard
                board={boardState}
                orientation={orientation}
                selected={selected}
                targets={targets}
                lastMove={lastMove}
                checkSquare={checkSquare ?? undefined}
                onSquare={handleSquare}
                disabled={phase !== "playing" || !!promotion}
                colors={colors}
                pieces={pieces}
              />
              {promotion && (
                <PromotionPicker
                  color={gameRef.current.turn()}
                  onCancel={() => {
                    setPromotion(null);
                    setSelected(null);
                    setTargets([]);
                  }}
                  onPick={(p) => {
                    const { from, to } = promotion;
                    setPromotion(null);
                    commitMove(from, to, p);
                  }}
                />
              )}
            </div>
            {phase === "playing" && (
              <div className="mt-3 text-center text-sm text-muted-foreground">
                {turn === "w" ? "White" : "Black"} to move
              </div>
            )}
          </div>

          {/* Move list */}
          <div className="lg:col-span-3">
            <Card className="p-4">
              <div className="mb-3 font-display">Moves</div>
              <div className="grid max-h-96 grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 overflow-y-auto pr-1 text-sm scrollbar-thin">
                {Array.from({ length: Math.ceil(history.length / 2) }).map((_, i) => (
                  <div className="contents" key={i}>
                    <div className="text-muted-foreground">{i + 1}.</div>
                    <div>{history[i * 2] ?? ""}</div>
                    <div className="text-muted-foreground">{history[i * 2 + 1] ?? ""}</div>
                  </div>
                ))}
                {history.length === 0 && (
                  <div className="col-span-3 text-xs text-muted-foreground">No moves yet</div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function PlayerCard({
  name,
  time,
  active,
  showClock,
  me,
  board,
  capturedColor,
}: {
  name: string;
  time: number;
  active: boolean;
  showClock: boolean;
  me?: boolean;
  board: BoardCell[][];
  capturedColor: "w" | "b";
}) {
  return (
    <Card className={`p-4 ${active ? "ring-1 ring-gold/60" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-full gradient-gold font-display text-background">
          {name[0]}
        </div>
        <div className="flex-1">
          <div className="text-sm">
            {name}
            {me ? " · You" : ""}
          </div>
          <CapturedPieces board={board} player={capturedColor} className="mt-0.5" />
          {active && (
            <div className="text-[10px] uppercase tracking-widest text-gold">Your turn</div>
          )}
        </div>
        {showClock && (
          <div
            className={`rounded-lg px-3 py-1.5 font-mono text-sm tabular-nums ${active ? "bg-gold text-[#0B0D10]" : "bg-white/5"}`}
          >
            {fmt(time)}
          </div>
        )}
      </div>
    </Card>
  );
}
