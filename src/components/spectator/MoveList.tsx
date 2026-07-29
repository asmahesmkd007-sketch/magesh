import { useEffect, useRef } from "react";

import type { SpectatorMove } from "@/lib/spectator/types";

/**
 * The move history, in numbered pairs, with click-to-jump.
 *
 * It lists only the plies the feed has RELEASED — a spectator scrubbing
 * back and forth can never reach a move the delay is still withholding,
 * because those moves are not in this array to begin with.
 */
export function MoveList({
  moves,
  currentPly,
  onJump,
  className = "",
}: {
  moves: SpectatorMove[];
  /** Ply being displayed; 0 = starting position. */
  currentPly: number;
  onJump: (ply: number) => void;
  className?: string;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Keep the live move in view as the game runs on, without yanking the
  // page: only the list scrolls.
  useEffect(() => {
    const el = activeRef.current;
    const box = scrollRef.current;
    if (!el || !box) return;
    const top = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [currentPly]);

  if (moves.length === 0) {
    return (
      <div className={`px-3 py-6 text-center text-xs text-muted-foreground ${className}`}>
        No moves released yet.
      </div>
    );
  }

  const pairs: { number: number; white?: SpectatorMove; black?: SpectatorMove }[] = [];
  for (const m of moves) {
    const number = Math.floor((m.ply - 1) / 2) + 1;
    let pair = pairs[pairs.length - 1];
    if (!pair || pair.number !== number) {
      pair = { number };
      pairs.push(pair);
    }
    if (m.ply % 2 === 1) pair.white = m;
    else pair.black = m;
  }

  return (
    <div ref={scrollRef} className={`max-h-[320px] overflow-y-auto ${className}`}>
      <ol className="divide-y divide-white/5">
        {pairs.map((pair) => (
          <li key={pair.number} className="flex items-stretch text-sm">
            <span className="w-10 shrink-0 select-none py-1.5 pl-3 text-right text-[11px] tabular-nums text-muted-foreground">
              {pair.number}.
            </span>
            <Ply move={pair.white} currentPly={currentPly} onJump={onJump} activeRef={activeRef} />
            <Ply move={pair.black} currentPly={currentPly} onJump={onJump} activeRef={activeRef} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Ply({
  move,
  currentPly,
  onJump,
  activeRef,
}: {
  move?: SpectatorMove;
  currentPly: number;
  onJump: (ply: number) => void;
  activeRef: React.MutableRefObject<HTMLButtonElement | null>;
}) {
  if (!move) return <span className="flex-1" />;
  const active = move.ply === currentPly;
  return (
    <button
      ref={active ? activeRef : undefined}
      type="button"
      onClick={() => onJump(move.ply)}
      className={`flex-1 px-2 py-1.5 text-left transition-colors ${
        active ? "bg-gold/15 font-medium text-gold" : "text-foreground hover:bg-white/[0.04]"
      }`}
    >
      {move.san}
    </button>
  );
}
