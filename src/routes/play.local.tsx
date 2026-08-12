import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { RotateCcw, FlipVertical2, Flag, ArrowLeft, Handshake } from "lucide-react";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { InteractiveBoard, type BoardCell } from "@/components/site/InteractiveBoard";
import { CapturedPieces } from "@/components/site/CapturedPieces";
import { ClockTime } from "@/components/site/ClockTime";
import { PromotionPicker } from "@/components/site/PromotionPicker";
import { GameEndModal } from "@/components/site/GameEndModal";
import { useGameSettings } from "@/hooks/useGameSettings";
import { useClockAudio } from "@/hooks/useClockAudio";
import { useChessClock } from "@/hooks/useChessClock";
import {
  createClock,
  press,
  startTurn,
  stop as stopClock,
  type ClockState,
} from "@/lib/chess/clock";
import {
  checkedKingSquare,
  hasMatingMaterial,
  terminalStateOf,
  type EndReason,
} from "@/lib/chess/rules";
import { resultSentence, type GameResult } from "@/lib/chess/result";
import { playGameSound, soundForChessMove } from "@/lib/audio/sounds";
import { buzz } from "@/lib/haptics";
import { useAuth } from "@/hooks/useAuth";
import { saveLocalGame } from "@/lib/api/gameClient";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";

export const Route = createFileRoute("/play/local")({
  head: () =>
    seo({
      title: "Local Chess Game — Two Player Chess on One Device | ChessOx",
      description:
        "Play a two-player chess game locally on a single device. Full chess rules, move validation, clocks and captured pieces — free and no sign-up needed to start.",
      keywords: [
        "two player chess",
        "local chess game",
        "chess game online",
        "play chess offline",
        "how to play chess",
      ],
      path: "/play/local",
      jsonLd: [
        webPageLd({
          name: "Local Two-Player Chess — ChessOx",
          description:
            "A local chess board on ChessOx for two players sharing one device, with full rule enforcement, clocks and captured-piece tracking.",
          path: "/play/local",
          primaryTopic: "Two player chess game",
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Play Chess", path: "/play" },
          { name: "Local Play", path: "/play/local" },
        ]),
      ],
    }),
  component: LocalPlay,
});

// Covers every class the app advertises: bullet, blitz, rapid, classical.
const TIME_CONTROLS = [
  { label: "No timer", sec: 0, inc: 0 },
  { label: "1+0", sec: 60, inc: 0 },
  { label: "2+1", sec: 120, inc: 1 },
  { label: "3+0", sec: 180, inc: 0 },
  { label: "3+2", sec: 180, inc: 2 },
  { label: "5+0", sec: 300, inc: 0 },
  { label: "5+3", sec: 300, inc: 3 },
  { label: "10+0", sec: 600, inc: 0 },
  { label: "15+10", sec: 900, inc: 10 },
  { label: "30+20", sec: 1800, inc: 20 },
] as const;

type Phase = "setup" | "playing" | "over";
type Outcome = { result: GameResult; reason: string };

function LocalPlay() {
  const { settings } = useGameSettings();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("setup");
  const [tcIdx, setTcIdx] = useState(0);
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [selected, setSelected] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [showEndModal, setShowEndModal] = useState(false);

  const gameRef = useRef(new Chess());
  const [boardState, setBoardState] = useState<BoardCell[][]>(gameRef.current.board());
  const savedRef = useRef(false);
  // Read by the flag callback, which must not act on a stale phase.
  const phaseRef = useRef<Phase>("setup");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const tc = TIME_CONTROLS[tcIdx];

  // Wall-clock-anchored clock. The previous `setInterval(t => t - 1)` drifted,
  // gained time whenever the tab was backgrounded, and ended the game from
  // inside a state updater.
  const [clock, setClock] = useState<ClockState>(() => createClock({ initialMs: 0 }));

  const persistGame = useCallback(
    (verdict: GameResult, reason: string) => {
      if (!user) return;
      const moveHistory = gameRef.current.history({ verbose: true });
      if (moveHistory.length === 0) return;

      const replay = new Chess();
      const moves = moveHistory.map((m, idx) => {
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

      saveLocalGame({
        myColor: "w",
        opponentName: "Local Opponent",
        // The verdict is already a `game_result` member — it is no longer
        // re-derived by string-matching an English sentence, which is what
        // made "White wins on time" and "Black wins on time" both parse as
        // wins for whoever the prefix happened to name.
        result: verdict as "white" | "black" | "draw",
        endReason: reason,
        pgn: gameRef.current.pgn(),
        movesCount: moveHistory.length,
        finalFen: gameRef.current.fen(),
        moves,
      }).catch(() => {
        /* silent — archiving a casual local game is not critical */
      });
    },
    [user],
  );

  const endGame = useCallback(
    (verdict: GameResult, reason: EndReason | string) => {
      setClock((c) => stopClock(c, Date.now()));
      setOutcome({ result: verdict, reason });
      setPhase("over");
      phaseRef.current = "over";
      setShowEndModal(true);
      if (verdict === "draw") playGameSound("draw");
      else playGameSound("victory");
      if (!savedRef.current) {
        savedRef.current = true;
        persistGame(verdict, reason);
      }
    },
    [persistGame],
  );

  const onFlag = useCallback(
    (color: "w" | "b") => {
      if (phaseRef.current !== "playing") return;
      const opponent: "w" | "b" = color === "w" ? "b" : "w";
      // FIDE 6.9 — a flag fall is only a loss if the opponent could still
      // mate. Bare king (or king + single minor) makes it a draw.
      if (!hasMatingMaterial(gameRef.current, opponent)) {
        endGame("draw", "timeout_vs_insufficient");
        return;
      }
      endGame(opponent === "w" ? "white" : "black", "timeout");
    },
    [endGame],
  );

  const { whiteMs, blackMs } = useChessClock(clock, {
    showTenths: settings.show_tenths,
    onFlag,
  });

  function beginGame() {
    gameRef.current = new Chess();
    savedRef.current = false;
    setBoardState(gameRef.current.board());
    setSelected(null);
    setTargets([]);
    setPromotion(null);
    setLastMove(null);
    setHistory([]);
    setOutcome(null);
    setShowEndModal(false);
    setPhase("playing");
    phaseRef.current = "playing";
    const fresh = createClock({ initialMs: tc.sec * 1000, incrementMs: tc.inc * 1000 });
    setClock(tc.sec > 0 ? startTurn(fresh, "w", Date.now()) : fresh);
    if (settings.auto_flip) setOrientation("w");
  }

  function resetGame() {
    setClock((c) => stopClock(c, Date.now()));
    setPhase("setup");
    phaseRef.current = "setup";
  }

  function handleSquare(sq: string) {
    if (phase !== "playing" || promotion) return;
    const g = gameRef.current;
    const square = sq as Square;
    if (selected) {
      const moveList = g.moves({ square: selected as Square, verbose: true });
      const m = moveList.find((mv) => mv.to === square);
      if (m) {
        if (m.flags.includes("p")) {
          if (settings.auto_queen) {
            commitMove(selected, square, "q");
          } else {
            setPromotion({ from: selected, to: square });
          }
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

    const now = Date.now();
    // Bank the mover's time and hand the clock over in one operation, so
    // the increment is applied exactly once and no time is lost between
    // "move made" and "opponent's clock started".
    setClock((c) => (c.untimed ? c : press(c, now)));

    setBoardState(g.board());
    setLastMove({ from, to });
    setSelected(null);
    setTargets([]);
    setHistory(g.history());
    buzz();

    // One terminal check, from the shared rules module. The old chain put
    // `isDraw()` before `isStalemate()`, which made the stalemate branch
    // unreachable and reported every stalemate as a bare "Draw".
    const terminal = terminalStateOf(g);
    if (terminal) {
      if (terminal.reason === "checkmate") playGameSound("checkmate");
      endGame(terminal.result, terminal.reason);
      return;
    }

    soundForChessMove(m, g);
    if (settings.auto_flip) setOrientation(g.turn());
  }

  function offerDraw() {
    if (phase !== "playing") return;
    if (settings.confirm_draw_offer && !confirm("Agree to a draw?")) return;
    endGame("draw", "agreement");
  }

  const checkSquare = useMemo(() => {
    // boardState is the render-time snapshot; recomputing from it keeps the
    // memo honest about what it actually depends on.
    void boardState;
    return checkedKingSquare(gameRef.current);
  }, [boardState]);

  const endState = useMemo(() => {
    if (phase !== "over" || !outcome) return null;
    if (outcome.result !== "white" && outcome.result !== "black" && outcome.result !== "draw") {
      return null;
    }
    return { result: outcome.result, reason: outcome.reason };
  }, [phase, outcome]);

  const turn = gameRef.current.turn();
  const headline = outcome ? resultSentence(outcome.result, outcome.reason) : null;

  return (
    <PageShell
      eyebrow={phase === "setup" ? "Local Play" : undefined}
      title={phase === "setup" ? "Two Player" : undefined}
      subtitle={phase === "setup" ? "Both players on the same device — pass and play." : undefined}
      compact={true}
    >
      {showEndModal && outcome && (
        <GameEndModal
          result={outcome.result}
          reason={outcome.reason}
          onClose={() => setShowEndModal(false)}
          isLocal
        />
      )}
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center justify-center max-w-6xl mx-auto py-2">
          {/* LEFT COLUMN: PLAYER CARDS & CHESS BOARD */}
          <div className="lg:col-span-7 xl:col-span-7 flex flex-col items-center justify-center w-full mx-auto">
            {/* Top Player (Opponent) */}
            <div className="w-full max-w-[560px] mb-1">
              <PlayerCard
                name={orientation === "w" ? "Black" : "White"}
                ms={orientation === "w" ? blackMs : whiteMs}
                active={phase === "playing" && turn !== orientation}
                showClock={!clock.untimed}
                board={boardState}
                capturedColor={orientation === "w" ? "b" : "w"}
              />
            </div>

            {/* Chess Board */}
            <div className="w-full max-w-[560px] mx-auto relative flex flex-col items-center justify-center">
              <InteractiveBoard
                board={boardState}
                orientation={orientation}
                selected={selected}
                targets={targets}
                lastMove={lastMove}
                checkSquare={checkSquare ?? undefined}
                onSquare={handleSquare}
                disabled={phase !== "playing" || !!promotion}
                endState={endState}
              />
              {promotion && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-xs">
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
                </div>
              )}
            </div>

            {/* Bottom Player (You) */}
            <div className="w-full max-w-[560px] mt-1">
              <PlayerCard
                name={orientation === "w" ? "White" : "Black"}
                ms={orientation === "w" ? whiteMs : blackMs}
                active={phase === "playing" && turn === orientation}
                showClock={!clock.untimed}
                board={boardState}
                capturedColor={orientation === "w" ? "w" : "b"}
                me
              />
            </div>
          </div>

          {/* RIGHT COLUMN: STATUS + MOVES + CONTROLS */}
          <div className="lg:col-span-5 xl:col-span-5 flex flex-col gap-3 w-full max-w-[380px] mx-auto">
            {/* Game Status Banner */}
            <div className="rounded-xl border border-gold/20 bg-black/60 p-2.5 text-center min-h-[50px] flex flex-col justify-center shrink-0">
              <div className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">
                {phase === "over"
                  ? headline
                  : gameRef.current.inCheck()
                    ? "Check!"
                    : `${turn === "w" ? "White" : "Black"}'s turn`}
              </div>
            </div>

            {/* Move List */}
            <Card className="p-3.5">
              <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
                <div className="font-display text-sm font-bold text-foreground">Move List</div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {history.length} ply
                </span>
              </div>
              <div className="grid max-h-[min(260px,calc(100vh-380px))] grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-1 overflow-y-auto pr-2 text-xs font-mono scrollbar-thin">
                {Array.from({ length: Math.ceil(history.length / 2) }).map((_, i) => (
                  <div className="contents" key={i}>
                    <div className="text-right text-muted-foreground/60">{i + 1}.</div>
                    <div className="text-foreground">{history[i * 2] ?? ""}</div>
                    <div className="text-muted-foreground">{history[i * 2 + 1] ?? ""}</div>
                  </div>
                ))}
                {history.length === 0 && (
                  <div className="col-span-3 text-xs text-muted-foreground italic">
                    No moves yet — make the opening move.
                  </div>
                )}
              </div>
            </Card>

            {/* Game Controls */}
            {phase === "playing" && (
              <Card className="p-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] py-2 text-xs font-medium transition hover:border-gold/30 hover:bg-gold/10 text-foreground"
                  >
                    <FlipVertical2 className="h-3.5 w-3.5" /> Flip Board
                  </button>
                  <button
                    onClick={offerDraw}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] py-2 text-xs font-medium transition hover:border-gold/30 hover:bg-gold/10 text-foreground"
                  >
                    <Handshake className="h-3.5 w-3.5" /> Offer Draw
                  </button>
                  <button
                    onClick={() => {
                      if (settings.confirm_resign && !confirm("Resign this game?")) return;
                      endGame(turn === "w" ? "black" : "white", "resignation");
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 py-2 text-xs font-medium text-destructive transition hover:bg-destructive/10"
                  >
                    <Flag className="h-3.5 w-3.5" /> Resign
                  </button>
                  <button
                    onClick={resetGame}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] py-2 text-xs font-medium transition hover:border-gold/30 hover:bg-gold/10 text-foreground"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> New Setup
                  </button>
                </div>
              </Card>
            )}

            {phase === "over" && (
              <div className="flex flex-col gap-2">
                <GoldButton onClick={beginGame} className="w-full">
                  Rematch
                </GoldButton>
                <GhostButton onClick={resetGame} className="w-full">
                  New Setup
                </GhostButton>
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}

function PlayerCard({
  name,
  ms,
  active,
  showClock,
  me,
  board,
  capturedColor,
}: {
  name: string;
  ms: number;
  active: boolean;
  showClock: boolean;
  me?: boolean;
  board: BoardCell[][];
  capturedColor: "w" | "b";
}) {
  // Hot-seat local play — whichever side is on the clock gets the audio
  // cue, not just "me", since both players share this device.
  useClockAudio(Math.ceil(ms / 1000), active && showClock);
  return (
    <div className="py-1 px-1 transition-all duration-300 w-full">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="grid h-8 w-8 place-items-center rounded-full gradient-gold font-display text-xs text-background font-bold shrink-0">
            {name[0]}
          </div>
          <div className="min-w-0 flex flex-col justify-center gap-0.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap text-sm font-semibold text-foreground">
              <span className="truncate">{name}</span>
              {me && (
                <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-gold border border-gold/30">
                  You
                </span>
              )}
            </div>
            <div className="flex items-center mt-0.5">
              <CapturedPieces board={board} player={capturedColor} className="flex items-center" />
            </div>
          </div>
        </div>

        {showClock && (
          <div
            className={`rounded-lg px-3 py-1 font-sans text-sm font-bold tracking-wide tabular-nums transition-all flex-shrink-0 ${
              active
                ? "bg-gold text-[#0B0D10] shadow-md shadow-gold/30 scale-105"
                : "bg-white/10 text-foreground/90 border border-white/15"
            }`}
          >
            <ClockTime ms={ms} active={active} />
          </div>
        )}
      </div>
    </div>
  );
}
