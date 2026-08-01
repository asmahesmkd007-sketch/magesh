import { X, Play, RotateCcw, Users, Home } from "lucide-react";
import { Link } from "@tanstack/react-router";
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4 animate-in fade-in duration-300">
      <div className="relative w-full max-w-sm rounded-3xl border border-gold/30 bg-black/95 p-6 shadow-2xl shadow-gold/20 animate-in zoom-in-95 duration-300">
        <button
          onClick={onClose}
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

        <div className="mt-8 flex flex-col gap-3">
          {onRematch ? (
            <GoldButton
              onClick={onRematch}
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
              <Link to="/play">
                <GoldButton className="w-full">
                  <RotateCcw className="mr-2 h-4 w-4" /> Rematch
                </GoldButton>
              </Link>
            )
          )}
          {roomId ? (
            roomHostId === currentUserId ? (
              <Link to="/room/$roomId" params={{ roomId }}>
                <GhostButton className="w-full border border-white/10">
                  <Users className="mr-2 h-4 w-4" /> Next Player / Lobby
                </GhostButton>
              </Link>
            ) : (
              <Link to="/">
                <GhostButton className="w-full border border-white/10">
                  <Home className="mr-2 h-4 w-4" /> Back to Home
                </GhostButton>
              </Link>
            )
          ) : (
            <Link to="/play">
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
