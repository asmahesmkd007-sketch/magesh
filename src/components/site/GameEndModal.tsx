import { X, Play, LineChart } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { GoldButton, GhostButton } from "./Primitives";

export type GameEndResult = "white" | "black" | "draw" | "resigned";

type Props = {
  result: GameEndResult;
  reason: string;
  onClose: () => void;
  gameId?: string;
  isLocal?: boolean;
};

export function GameEndModal({ result, reason, onClose, gameId, isLocal }: Props) {
  const isDraw = result === "draw";
  const title = isDraw
    ? "Draw"
    : result === "resigned"
      ? "Resignation"
      : `${result === "white" ? "White" : "Black"} Wins`;
  const icon = isDraw ? "🤝" : result === "resigned" ? "🏳" : "🏆";

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
          <p className="mt-2 text-sm font-medium uppercase tracking-widest text-muted-foreground">
            {reason}
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          {!isLocal && gameId && (
            <Link to="/analysis" search={{ gameId }}>
              <GoldButton className="w-full">
                <LineChart className="mr-2 h-4 w-4" /> Review Game
              </GoldButton>
            </Link>
          )}
          <Link to="/play">
            <GhostButton className="w-full border border-white/10">
              <Play className="mr-2 h-4 w-4" /> New Game
            </GhostButton>
          </Link>
        </div>
      </div>
    </div>
  );
}
