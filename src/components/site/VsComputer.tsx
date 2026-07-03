import { useCallback, useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bot, Crown, Flag, Handshake, RotateCcw, Sparkles, Swords, LineChart } from "lucide-react";
import { Card, GoldButton, GhostButton, SectionTitle } from "@/components/site/Primitives";
import { InteractiveBoard, type BoardCell } from "@/components/site/InteractiveBoard";
import { CapturedPieces } from "@/components/site/CapturedPieces";
import { PromotionPicker } from "@/components/site/PromotionPicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth, useProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { saveComputerGame } from "@/lib/api/gameClient";
import type { EngineMove } from "@/lib/chess/engine";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, "0")}`;

type Phase = "setup" | "playing" | "over";
type SideChoice = "w" | "b" | "random";
type GameResult = "win" | "loss" | "draw";

const LEVELS = [
  { level: 1, name: "Pawn", rating: "~600", desc: "Plays loose, makes blunders" },
  { level: 2, name: "Knight", rating: "~900", desc: "Basic tactics, some mistakes" },
  { level: 3, name: "Bishop", rating: "~1300", desc: "Solid moves, punishes blunders" },
  { level: 4, name: "Rook", rating: "~1700", desc: "Sharp tactics, few mistakes" },
  { level: 5, name: "Vizier", rating: "~2000", desc: "Ruthless calculation" },
];

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function VsComputer() {
  const { user } = useAuth();
  const { profile } = useProfile(user?.id);
  const navigate = useNavigate();

  // Fetch player's real rating for the rapid time class
  const [myRating, setMyRating] = useState<number>(100);
  useEffect(() => {
    if (!user) return;
    supabase
      .from("ratings")
      .select("rating")
      .eq("user_id", user.id)
      .eq("time_class", "rapid")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.rating) setMyRating(data.rating);
      });
  }, [user?.id]);

  const [phase, setPhase] = useState<Phase>("setup");
  const [side, setSide] = useState<SideChoice>("w");
  const [level, setLevel] = useState(3);
  const [myColor, setMyColor] = useState<"w" | "b">("w");

  const gameRef = useRef(new Chess());
  const [board, setBoard] = useState<BoardCell[][]>(gameRef.current.board());
  const [selected, setSelected] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(
    null,
  );
  const [whiteTime, setWhiteTime] = useState(900);
  const [blackTime, setBlackTime] = useState(900);

  const workerRef = useRef<Worker | null>(null);
  const tokenRef = useRef(0);
  const savedRef = useRef(false);
  const movesEndRef = useRef<HTMLDivElement>(null);

  const onEngineMoveRef = useRef<(move: EngineMove | null) => void>(() => {});

  // Spin up engine worker on the client
  useEffect(() => {
    const worker = new Worker(new URL("../../lib/chess/engine.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<{ token: number; move: EngineMove | null }>) => {
      if (e.data.token !== tokenRef.current) return;
      setThinking(false);
      onEngineMoveRef.current(e.data.move);
    };
    return () => {
      tokenRef.current = -1;
      worker.terminate();
    };
  }, []);

  onEngineMoveRef.current = (move: EngineMove | null) => {
    if (!move) return;
    const game = gameRef.current;
    try {
      const made = game.move({ from: move.from, to: move.to, promotion: move.promotion ?? "q" });
      setLastMove({ from: made.from, to: made.to });
      syncBoard();
      checkGameEnd();
    } catch {
      /* stale or invalid — ignore */
    }
  };

  useEffect(() => {
    movesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  // Clock countdown
  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      const turn = gameRef.current.turn();
      if (turn === "w") {
        setWhiteTime((t) => {
          if (t <= 1) return 0;
          return t - 1;
        });
      } else {
        setBlackTime((t) => {
          if (t <= 1) return 0;
          return t - 1;
        });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Flag enforcement: end the game when either clock hits 0
  useEffect(() => {
    if (phase !== "playing") return;
    const myTime = myColor === "w" ? whiteTime : blackTime;
    const oppTime = myColor === "w" ? blackTime : whiteTime;
    if (myTime === 0) {
      finishGame(myColor === "w" ? "black" : "white", "timeout");
    } else if (oppTime === 0 && gameRef.current.turn() !== myColor) {
      finishGame(myColor === "w" ? "white" : "black", "timeout");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whiteTime, blackTime, phase, myColor]);

  const syncBoard = () => {
    setBoard(gameRef.current.board());
    setHistory(gameRef.current.history());
    setSelected(null);
    setTargets([]);
  };

  const checkSquare = (() => {
    const game = gameRef.current;
    if (!game.inCheck()) return null;
    const turn = game.turn();
    for (const row of board) {
      for (const cell of row) {
        if (cell && cell.type === "k" && cell.color === turn) return cell.square;
      }
    }
    return null;
  })();

  const finishGame = useCallback(
    async (result: "white" | "black" | "draw", reason: string) => {
      setPhase("over");
      setThinking(false);
      const iWon =
        (result === "white" && myColor === "w") || (result === "black" && myColor === "b");
      const text =
        result === "draw"
          ? `Draw — ${reason}`
          : iWon
            ? `You win — ${reason}`
            : `Engine wins — ${reason}`;
      setResultText(text);
      setGameResult(result === "draw" ? "draw" : iWon ? "win" : "loss");
      setShowResult(true);

      if (user && !savedRef.current) {
        savedRef.current = true;
        const game = gameRef.current;
        const activeLevel = LEVELS.find((l) => l.level === level)!;
        const engineName = `Engine — ${activeLevel.name}`;
        try {
          // Replay the game to collect per-move FEN data and flags
          const replay = new Chess();
          const verboseHistory = game.history({ verbose: true });
          const moves = verboseHistory.map((m, idx) => {
            const fenBefore = replay.fen();
            replay.move({ from: m.from, to: m.to, promotion: m.promotion });
            return {
              ply: idx + 1,
              san: m.san,
              uci: m.from + m.to + (m.promotion ?? ""),
              fen_before: fenBefore,
              fen_after: replay.fen(),
              by_user: m.color === myColor ? user.id : undefined,
              is_capture: !!m.captured,
              is_check: replay.inCheck(),
              is_promotion: !!m.promotion,
              is_castling: m.flags.includes("k") || m.flags.includes("q"),
            };
          });
          await saveComputerGame({
            myColor,
            result,
            pgn: game.pgn(),
            movesCount: game.history().length,
            engineName,
            finalFen: game.fen(),
            moves,
          });
          toast.success("Game saved to your archive.");
        } catch {
          toast.error("Could not save game to your archive.");
        }
      }
    },
    [user, myColor, level],
  );

  const checkGameEnd = useCallback(() => {
    const game = gameRef.current;
    if (!game.isGameOver()) return false;
    if (game.isCheckmate()) {
      finishGame(game.turn() === "w" ? "black" : "white", "checkmate");
    } else if (game.isStalemate()) {
      finishGame("draw", "stalemate");
    } else if (game.isThreefoldRepetition()) {
      finishGame("draw", "threefold repetition");
    } else if (game.isInsufficientMaterial()) {
      finishGame("draw", "insufficient material");
    } else {
      finishGame("draw", "fifty-move rule");
    }
    return true;
  }, [finishGame]);

  const requestEngineMove = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;
    setThinking(true);
    tokenRef.current += 1;
    worker.postMessage({ token: tokenRef.current, fen: gameRef.current.fen(), level });
  }, [level]);

  const startGame = () => {
    const color: "w" | "b" = side === "random" ? (Math.random() < 0.5 ? "w" : "b") : side;
    gameRef.current = new Chess();
    savedRef.current = false;
    setMyColor(color);
    setLastMove(null);
    setResultText(null);
    setGameResult(null);
    setShowResult(false);
    setPendingPromotion(null);
    setPhase("playing");
    setBoard(gameRef.current.board());
    setHistory([]);
    setSelected(null);
    setTargets([]);
    setWhiteTime(900);
    setBlackTime(900);
    if (color === "b") {
      setTimeout(() => {
        const worker = workerRef.current;
        if (!worker) return;
        setThinking(true);
        tokenRef.current += 1;
        worker.postMessage({ token: tokenRef.current, fen: gameRef.current.fen(), level });
      }, 60);
    }
  };

  const playPlayerMove = (from: string, to: string, promotion?: "q" | "r" | "b" | "n") => {
    const game = gameRef.current;
    try {
      const made = game.move({ from, to, promotion });
      setLastMove({ from: made.from, to: made.to });
      syncBoard();
      if (!checkGameEnd()) requestEngineMove();
    } catch {
      setSelected(null);
      setTargets([]);
    }
  };

  const onSquare = (sq: string) => {
    if (phase !== "playing" || thinking || pendingPromotion) return;
    const game = gameRef.current;
    if (game.turn() !== myColor) return;

    const piece = game.get(sq as Square);

    if (piece && piece.color === myColor) {
      setSelected(sq);
      setTargets(game.moves({ square: sq as Square, verbose: true }).map((m) => m.to));
      return;
    }

    if (selected) {
      const candidates = game
        .moves({ square: selected as Square, verbose: true })
        .filter((m) => m.to === sq);
      if (candidates.length === 0) {
        setSelected(null);
        setTargets([]);
        return;
      }
      // Pawn reaches back rank → promotion required
      if (candidates.some((m) => m.piece === "p" && (m.to[1] === "8" || m.to[1] === "1"))) {
        setPendingPromotion({ from: selected, to: sq });
        return;
      }
      playPlayerMove(selected, sq);
    }
  };

  const resign = () => {
    if (phase !== "playing") return;
    finishGame(myColor === "w" ? "black" : "white", "resignation");
  };

  const offerDraw = () => {
    if (phase !== "playing") return;
    let balance = 0;
    for (const row of gameRef.current.board()) {
      for (const cell of row) {
        if (cell) balance += (cell.color === myColor ? -1 : 1) * PIECE_VALUES[cell.type];
      }
    }
    if (balance >= 1) {
      toast.info("The engine declines — it likes its position.");
    } else {
      finishGame("draw", "mutual agreement");
    }
  };

  const analyzeGame = () => {
    localStorage.setItem("chessox-analysis-pgn", gameRef.current.pgn());
    navigate({ to: "/analysis", search: { gameId: undefined } });
  };

  const movePairs: [string, string | undefined][] = [];
  for (let i = 0; i < history.length; i += 2) movePairs.push([history[i], history[i + 1]]);

  const activeLevel = LEVELS.find((l) => l.level === level)!;
  const oppRating = 600 + (level - 1) * 350;

  // ============ SETUP ============
  if (phase === "setup") {
    return (
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="p-6 lg:col-span-5">
          <SectionTitle kicker="Challenge" title="Face the Engine" />
          <div className="mb-5">
            <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Strength
            </div>
            <div className="space-y-2">
              {LEVELS.map((l) => (
                <button
                  key={l.level}
                  onClick={() => setLevel(l.level)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                    level === l.level
                      ? "border-gold/50 bg-gold/10"
                      : "border-white/5 bg-white/[0.02] hover:border-white/10"
                  }`}
                >
                  <Bot
                    className={`h-5 w-5 ${level === l.level ? "text-gold" : "text-muted-foreground"}`}
                  />
                  <div className="flex-1">
                    <div className="font-display">
                      {l.name} <span className="text-xs text-muted-foreground">{l.rating}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{l.desc}</div>
                  </div>
                  {level === l.level && <span className="h-2 w-2 rounded-full bg-gold" />}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Your side
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["w", "White"],
                  ["random", "Random"],
                  ["b", "Black"],
                ] as [SideChoice, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setSide(value)}
                  className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    side === value
                      ? "border-gold/50 bg-gold/10 text-gold"
                      : "border-white/5 bg-white/[0.02] hover:border-white/10"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <GoldButton className="w-full" onClick={startGame}>
            <Swords className="h-4 w-4" /> Begin the Battle
          </GoldButton>
          {!user && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Sign in to save finished games to your archive.
            </p>
          )}
        </Card>

        <div className="lg:col-span-7">
          <InteractiveBoard board={board} orientation="w" disabled />
        </div>
      </div>
    );
  }

  // ============ PLAYING / OVER ============
  const myName = profile?.display_name ?? profile?.username ?? "You";
  const myInitial = myName[0]?.toUpperCase() ?? "Y";
  const myTime = myColor === "w" ? whiteTime : blackTime;
  const oppTime = myColor === "w" ? blackTime : whiteTime;
  const isMyTurn = phase === "playing" && gameRef.current.turn() === myColor && !thinking;
  const isOppTurn = phase === "playing" && gameRef.current.turn() !== myColor;

  const ProfileCard = ({
    label,
    name,
    rating,
    time,
    active,
    icon,
    iconBg,
    capturedColor,
  }: {
    label: string;
    name: string;
    rating: number;
    time: number;
    active: boolean;
    icon: React.ReactNode;
    iconBg: string;
    capturedColor: "w" | "b";
  }) => (
    <Card className="p-5 text-center">
      <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{label}</div>
      <div className="mx-auto mt-4 grid h-20 w-20 place-items-center rounded-full bg-[#1a0d10] ring-2 ring-gold/70 shadow-[0_0_24px_rgba(212,175,55,0.25)]">
        <div
          className={`grid h-16 w-16 place-items-center rounded-full ${iconBg} font-display text-2xl text-ivory`}
        >
          {icon}
        </div>
      </div>
      <div className="mt-3 truncate font-display text-sm">{name}</div>
      <div className="mt-1">
        <span className="font-stat text-2xl text-gradient-gold">{rating}</span>
        <span className="ml-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          ELO
        </span>
      </div>
      <div
        className={`mx-auto mt-4 w-fit rounded-full border px-5 py-1.5 font-stat text-xl tabular-nums transition-colors ${
          active
            ? "border-gold/80 text-gold shadow-[0_0_18px_rgba(212,175,55,0.35)]"
            : "border-gold/20 text-foreground/70"
        }`}
      >
        {fmt(time)}
      </div>
      <div className="mt-3 flex justify-center">
        <CapturedPieces board={board} player={capturedColor} />
      </div>
    </Card>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
      {/* LEFT — Your profile */}
      <div className="space-y-4">
        <ProfileCard
          label="Your Profile"
          name={myName}
          rating={myRating}
          time={myTime}
          active={isMyTurn}
          icon={myInitial}
          iconBg="gradient-gold text-[#0B0D10]"
          capturedColor={myColor}
        />
      </div>

      {/* CENTER — Board + actions */}
      <div className="flex flex-col items-center gap-6">
        <div className="relative w-full">
          <InteractiveBoard
            board={board}
            orientation={myColor}
            selected={selected}
            targets={targets}
            lastMove={lastMove}
            checkSquare={checkSquare}
            onSquare={onSquare}
            disabled={phase !== "playing"}
          />
          {pendingPromotion && (
            <PromotionPicker
              color={myColor}
              onPick={(p) => {
                const pp = pendingPromotion;
                setPendingPromotion(null);
                playPlayerMove(pp.from, pp.to, p);
              }}
              onCancel={() => {
                setPendingPromotion(null);
                setSelected(null);
                setTargets([]);
              }}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <GhostButton onClick={() => setPhase("setup")}>
            <RotateCcw className="h-4 w-4" /> New Game
          </GhostButton>
          <GhostButton onClick={analyzeGame}>
            <LineChart className="h-4 w-4" /> Analysis
          </GhostButton>
          {phase === "playing" ? (
            <>
              <GhostButton onClick={resign}>
                <Flag className="h-4 w-4" /> Resign
              </GhostButton>
              <GhostButton onClick={offerDraw}>
                <Handshake className="h-4 w-4" /> Draw
              </GhostButton>
            </>
          ) : (
            <GoldButton onClick={() => setShowResult(true)}>
              <Crown className="h-4 w-4" /> View Result
            </GoldButton>
          )}
        </div>

        <div className="text-center text-xs uppercase tracking-[0.24em] text-muted-foreground">
          {phase === "over"
            ? resultText
            : thinking
              ? "Engine is thinking…"
              : gameRef.current.inCheck()
                ? "Check!"
                : isMyTurn
                  ? "Your move"
                  : "Awaiting opponent…"}
        </div>
      </div>

      {/* RIGHT — Move list + opponent */}
      <div className="space-y-4">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-display text-lg">Move List</div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {history.length} ply
            </span>
          </div>
          <div className="grid max-h-[260px] grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-1.5 overflow-y-auto pr-2 text-sm scrollbar-thin">
            {movePairs.length === 0 && (
              <div className="col-span-3 text-xs text-muted-foreground">
                No moves yet — make the opening move.
              </div>
            )}
            {movePairs.map((pair, i) => (
              <div className="contents" key={i}>
                <div className="text-right text-muted-foreground">{i + 1}.</div>
                <div className="font-mono">{pair[0]}</div>
                <div className="font-mono text-muted-foreground">{pair[1] ?? ""}</div>
              </div>
            ))}
            <div ref={movesEndRef} className="col-span-3" />
          </div>
        </Card>

        <ProfileCard
          label="Opponent Profile"
          name={`${activeLevel.name} Engine`}
          rating={oppRating}
          time={oppTime}
          active={isOppTurn}
          icon={<Bot className="h-7 w-7" />}
          iconBg="bg-emerald/25 text-emerald"
          capturedColor={myColor === "w" ? "b" : "w"}
        />

        {thinking && (
          <div className="flex items-center justify-center gap-2 text-xs text-gold/80">
            <Sparkles className="h-3 w-3 animate-pulse" /> Engine is thinking…
          </div>
        )}
      </div>

      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="border-gold/25 bg-background/95 backdrop-blur-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center font-display text-4xl">
              {gameResult === "win" ? (
                <span className="text-gradient-gold">You Won 👑</span>
              ) : gameResult === "loss" ? (
                "You Lost"
              ) : (
                "Draw"
              )}
            </DialogTitle>
            <DialogDescription className="text-center">{resultText}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2 text-center">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Moves
              </div>
              <div className="mt-1 font-display text-2xl">{history.length}</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Level
              </div>
              <div className="mt-1 font-display text-2xl">{activeLevel.name}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <GoldButton onClick={startGame}>
              <RotateCcw className="h-4 w-4" /> Rematch
            </GoldButton>
            <GhostButton onClick={analyzeGame}>
              <LineChart className="h-4 w-4" /> Analyze Game
            </GhostButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
