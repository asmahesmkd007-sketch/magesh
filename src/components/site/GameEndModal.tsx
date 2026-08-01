import { useState, useEffect } from "react";
import { X, Play, RotateCcw, Users, Home, Timer } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { GoldButton, GhostButton } from "./Primitives";
import {
  formatEndReason,
  normalizeResult,
  personalHeadline,
  resultHeadline,
  type GameResult,
} from "@/lib/chess/result";

type Props = {
  /** The raw `games.result` value; any of the five `game_result` members. */
  result: GameResult | string;
  /** The raw `games.end_reason` value — humanised for display here. */
  reason?: string | null;
  /** The viewer's seat, so the headline can say "You Won"/"You Lost". */
  myColor?: "w" | "b" | null;
  onClose: () => void;
  gameId?: string;
  isLocal?: boolean;
  roomId?: string;
  roomHostId?: string;
  currentUserId?: string;
  onRematch?: () => void;
  rematchStatus?: "none" | "offered" | "incoming";
};

export function GameEndModal({
  result,
  reason,
  myColor,
  onClose,
  gameId,
  isLocal,
  roomId,
  roomHostId,
  currentUserId,
  onRematch,
  rematchStatus = "none",
}: Props) {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(5);
  const [isTimerActive, setIsTimerActive] = useState(true);

  // Never infer a winner from a value we don't recognise — `normalizeResult`
  // sends anything unexpected to "ongoing" instead of to a Black win, which
  // is what the previous `result === "white" ? … : "Black"` ternary did for
  // draws, aborts and unfinished games alike.
  const verdict = normalizeResult(result);
  const isDraw = verdict === "draw";
  const isAborted = verdict === "aborted";

  // The neutral headline always states *who* won; the reason line carries
  // *how*. Resignation used to replace the headline entirely, which meant a
  // resigned game never showed a winner at all.
  const title = myColor ? personalHeadline(verdict, myColor) : resultHeadline(verdict);
  const subtitle = myColor && verdict !== "ongoing" ? resultHeadline(verdict) : null;
  const detail = formatEndReason(reason);
  const icon = isAborted ? "⊘" : isDraw ? "🤝" : verdict === "ongoing" ? "⏳" : "🏆";

  useEffect(() => {
    if (!isTimerActive) return;

    if (countdown <= 0) {
      setIsTimerActive(false);
      if (rematchStatus === "incoming" && onRematch) {
        onRematch();
      } else if (roomId) {
        if (roomHostId === currentUserId) {
          void navigate({ to: "/room/$roomId", params: { roomId } });
        } else {
          void navigate({ to: "/" });
        }
      } else {
        void navigate({ to: "/play" });
      }
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    countdown,
    isTimerActive,
    rematchStatus,
    onRematch,
    roomId,
    roomHostId,
    currentUserId,
    navigate,
  ]);

  const handleClose = () => {
    setIsTimerActive(false);
    onClose();
  };

  const handleRematchClick = () => {
    setIsTimerActive(false);
    if (onRematch) onRematch();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4 animate-in fade-in duration-300">
      <div className="relative w-full max-w-sm rounded-3xl border border-gold/30 bg-black/95 p-6 shadow-2xl shadow-gold/20 animate-in zoom-in-95 duration-300">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="text-center mt-2">
          <div className="mb-4 text-5xl">{icon}</div>
          <h2 className="font-display text-3xl text-gradient-gold uppercase">{title}</h2>
          {subtitle && (
            <p className="mt-1 text-sm font-medium uppercase tracking-widest text-gold/80">
              {subtitle}
            </p>
          )}
          {detail && (
            <p className="mt-2 text-sm font-medium uppercase tracking-widest text-muted-foreground">
              {detail}
            </p>
          )}
        </div>

        {isTimerActive && countdown > 0 && (
          <div className="mt-5 flex flex-col items-center justify-center gap-1.5 rounded-xl border border-gold/20 bg-gold/5 py-2.5 px-4 animate-pulse">
            <div className="flex items-center gap-2 text-xs font-semibold text-gold">
              <Timer className="h-3.5 w-3.5 animate-spin" />
              <span>
                Auto-redirect in{" "}
                <strong className="text-sm font-bold text-gradient-gold">{countdown}s</strong>
              </span>
            </div>
            <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-gold h-full transition-all duration-1000 ease-linear"
                style={{ width: `${(countdown / 5) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {onRematch ? (
            <GoldButton
              onClick={handleRematchClick}
              disabled={rematchStatus === "offered"}
              className="w-full bg-gradient-to-r from-gold to-amber-500 text-black font-bold"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {rematchStatus === "offered"
                ? "Rematch Requested..."
                : rematchStatus === "incoming"
                  ? "Accept Rematch"
                  : "Rematch"}
            </GoldButton>
          ) : (
            !isLocal &&
            gameId && (
              <Link to="/play" onClick={() => setIsTimerActive(false)}>
                <GoldButton className="w-full">
                  <RotateCcw className="mr-2 h-4 w-4" /> Rematch
                </GoldButton>
              </Link>
            )
          )}
          {roomId ? (
            roomHostId === currentUserId ? (
              <Link
                to="/room/$roomId"
                params={{ roomId }}
                onClick={() => setIsTimerActive(false)}
              >
                <GhostButton className="w-full border border-white/10">
                  <Users className="mr-2 h-4 w-4" /> Next Player / Lobby
                </GhostButton>
              </Link>
            ) : (
              <Link to="/" onClick={() => setIsTimerActive(false)}>
                <GhostButton className="w-full border border-white/10">
                  <Home className="mr-2 h-4 w-4" /> Back to Home
                </GhostButton>
              </Link>
            )
          ) : (
            <Link to="/play" onClick={() => setIsTimerActive(false)}>
              <GhostButton className="w-full border border-white/10">
                <Play className="mr-2 h-4 w-4" /> New Game
              </GhostButton>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

