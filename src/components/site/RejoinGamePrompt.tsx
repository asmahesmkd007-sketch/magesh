// =====================================================================
// REJOIN PROMPT — the returning player's way back into a live game
// ---------------------------------------------------------------------
// Mounted once at the root. After the session is restored it asks the
// server (never storage) whether this user has a board still in progress,
// and if so offers to resume it.
//
// It navigates nobody automatically: leaving a game and coming back to
// the site is not consent to be thrown onto a board. Cancel is purely a
// UI dismissal — it sends nothing, resigns nothing, and leaves the game
// under the same server rules it was already under.
// =====================================================================
import { useCallback, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Swords, X } from "lucide-react";
import { toast } from "sonner";

import { GhostButton, GoldButton } from "@/components/site/Primitives";
import { useRejoinableGame } from "@/hooks/useRejoinableGame";
import { authorizeRejoinServerFn } from "@/lib/api/rejoin.functions";
import type { RejoinableGame } from "@/lib/rejoin/eligibility";

/** Why the server refused, in words a player can act on. */
const REFUSAL_MESSAGE: Record<string, string> = {
  not_authenticated: "Please sign in again to rejoin.",
  not_found: "That game is no longer available.",
  not_a_player: "You are not a player in that game.",
  not_active: "That game has already finished.",
  expired: "That game has already ended on time.",
};

export function RejoinGamePrompt() {
  // A player already looking at a board does not need to be asked whether
  // they would like to look at a board.
  const onGameRoute = useRouterState({
    select: (s) => s.location.pathname.startsWith("/game/"),
  });

  const { games, dismiss } = useRejoinableGame(!onGameRoute);

  if (onGameRoute || games.length === 0) return null;
  return <PromptCard games={games} onDismiss={dismiss} />;
}

function PromptCard({
  games,
  onDismiss,
}: {
  games: RejoinableGame[];
  onDismiss: (gameId: string) => void;
}) {
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);

  const rejoin = useCallback(
    async (gameId: string) => {
      setBusyId(gameId);
      try {
        // Authorized against the caller's session before we move them —
        // the socket re-checks the same thing on join.
        const res = await authorizeRejoinServerFn({ data: { gameId } });
        if (!res.ok) {
          toast.error(REFUSAL_MESSAGE[res.reason] ?? "Could not rejoin that game.");
          // No longer rejoinable: stop offering it this page load.
          onDismiss(gameId);
          return;
        }
        // The existing game id, the existing board route. Nothing is created.
        await navigate({ to: "/game/$id", params: { id: res.gameId } });
      } catch {
        toast.error("Could not reach the server. Please try again.");
      } finally {
        setBusyId(null);
      }
    },
    [navigate, onDismiss],
  );

  const multiple = games.length > 1;

  return (
    <div className="fixed bottom-20 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] lg:bottom-6">
      <div className="royal-panel rounded-[22px] border border-gold/30 bg-[#0C0E12]/95 p-4 shadow-2xl shadow-gold/10 backdrop-blur-md animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gold/30 bg-gold/10">
            <Swords className="h-4 w-4 text-gold" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-sm font-bold text-foreground">
              {multiple ? `You have ${games.length} ongoing games` : "You have an ongoing game"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {multiple
                ? "Your matches are still in progress."
                : "Your match is still in progress."}
            </p>
          </div>
        </div>

        <ul className="mt-3 space-y-2">
          {games.map((game) => (
            <li key={game.gameId} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate font-medium text-foreground">
                  {game.whiteUsername ?? "White"}
                  <span className="mx-1.5 text-muted-foreground">vs</span>
                  {game.blackUsername ?? "Black"}
                </span>
                {multiple && (
                  <button
                    type="button"
                    aria-label="Dismiss this game"
                    onClick={() => onDismiss(game.gameId)}
                    className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                {game.timeControl && <span>{game.timeControl}</span>}
                <span>{game.isRated ? "Rated" : "Casual"}</span>
                <span>
                  {game.movesCount} {game.movesCount === 1 ? "move" : "moves"}
                </span>
                <span className="text-gold/80">
                  You are {game.color === "w" ? "White" : "Black"}
                </span>
              </div>
              {multiple && (
                <GoldButton
                  onClick={() => void rejoin(game.gameId)}
                  disabled={busyId === game.gameId}
                  className="mt-2.5 h-8 w-full px-3 text-xs"
                >
                  {busyId === game.gameId ? "Rejoining…" : "Rejoin Game"}
                </GoldButton>
              )}
            </li>
          ))}
        </ul>

        {!multiple && (
          <div className="mt-3 flex items-center gap-2">
            <GoldButton
              onClick={() => void rejoin(games[0].gameId)}
              disabled={busyId === games[0].gameId}
              className="h-9 flex-1 px-3 text-xs"
            >
              {busyId === games[0].gameId ? "Rejoining…" : "Rejoin Game"}
            </GoldButton>
            {/* Cancel is a dismissal and nothing else: no resign, no abort,
                no status change. The game stays exactly as the server has it. */}
            <GhostButton onClick={() => onDismiss(games[0].gameId)} className="h-9 px-4 text-xs">
              Cancel
            </GhostButton>
          </div>
        )}
        {multiple && (
          <GhostButton
            onClick={() => games.forEach((g) => onDismiss(g.gameId))}
            className="mt-2 h-9 w-full px-4 text-xs"
          >
            Cancel
          </GhostButton>
        )}
      </div>
    </div>
  );
}
