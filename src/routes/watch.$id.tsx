// =====================================================================
// /watch/$id — the spectator view
// ---------------------------------------------------------------------
// A read-only broadcast of one game: board, clocks, captures, move list
// and live statistics, fed by useSpectatorGame's poll of the delayed
// RPC. There is no move-submission path anywhere on this page and no
// subscription to the games table — a spectator's browser never holds a
// position newer than the delay allows.
//
// Players who open their own game here get the same UI undelayed, but
// are pointed back at /game/$id where they can actually move.
// =====================================================================
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Chess } from "chess.js";
import { ArrowLeft, EyeOff, Loader2, Swords, Trophy, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Card, GhostButton, GoldButton, PageShell } from "@/components/site/Primitives";
import { InteractiveBoard, type BoardCell } from "@/components/site/InteractiveBoard";
import { DelayBadge } from "@/components/spectator/DelayBadge";
import { LiveStatsPanel } from "@/components/spectator/LiveStatsPanel";
import { MoveList } from "@/components/spectator/MoveList";
import { SpectatorControls } from "@/components/spectator/SpectatorControls";
import { SpectatorPlayerBar } from "@/components/spectator/SpectatorPlayerBar";
import { ViewerCount } from "@/components/spectator/ViewerCount";
import { useAuth } from "@/hooks/useAuth";
import { useSpectatorGame } from "@/hooks/useSpectatorGame";
import { TIME_CLASS_LABEL, delayExplanation } from "@/lib/spectator/delay";
import { openingLabel } from "@/lib/spectator/openings";
import { computeLiveStats } from "@/lib/spectator/stats";
import { noindexSeo } from "@/lib/seo";

import { RequireAuth } from "@/components/auth/RequireAuth";

export const Route = createFileRoute("/watch/$id")({
  // Individual live games are transient and player-owned; they should not
  // be indexed, only linked.
  head: () => noindexSeo("Watch Live Chess — ChessOx", "Spectate a live chess game on ChessOx."),
  component: () => (
    <RequireAuth>
      <WatchGame />
    </RequireAuth>
  ),
});

function WatchGame() {
  const { id } = useParams({ from: "/watch/$id" });
  const { user } = useAuth();
  const { game, fen, ply, lastMove, available, loading, error, forbidden, viewers, controls } =
    useSpectatorGame(id, !!user);

  const [flipped, setFlipped] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);

  // Board matrix for the position being displayed. chess.js is only ever
  // used here to READ a FEN the server already released — it never
  // generates a move on this page.
  const board = useMemo<BoardCell[][]>(() => {
    try {
      return new Chess(fen).board();
    } catch {
      return new Chess().board();
    }
  }, [fen]);

  const checkSquare = useMemo(() => {
    try {
      const c = new Chess(fen);
      if (!c.inCheck()) return null;
      const turn = c.turn();
      for (const row of c.board())
        for (const cell of row)
          if (cell && cell.type === "k" && cell.color === turn) return cell.square;
      return null;
    } catch {
      return null;
    }
  }, [fen]);

  const stats = useMemo(
    () =>
      computeLiveStats({
        fen,
        moves: game?.moves.slice(0, ply) ?? [],
        startedAt: game?.started_at ?? null,
      }),
    [fen, game?.moves, game?.started_at, ply],
  );

  const opening = useMemo(
    () =>
      openingLabel(
        game?.opening,
        (game?.moves ?? []).slice(0, ply).map((m) => m.san),
      ),
    [game?.opening, game?.moves, ply],
  );

  const toggleFullscreen = useCallback(() => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Keyboard transport — the shortcuts a broadcast viewer expects.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        controls.previous();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        controls.next();
      } else if (e.key === "Home") {
        controls.first();
      } else if (e.key === "End") {
        controls.last();
      } else if (e.key === "f") {
        setFlipped((v) => !v);
      } else if (e.key === " ") {
        e.preventDefault();
        if (controls.paused) controls.toLive();
        else controls.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controls]);

  // ---- Early states ---------------------------------------------------
  if (forbidden) {
    return (
      <PageShell title="Not open to spectators" compact>
        <Card className="mx-auto max-w-lg p-10 text-center">
          <EyeOff className="mx-auto mb-4 h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {error ?? "The players have closed this game to spectators."}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Every player chooses who may watch their games — public, friends only, or nobody.
          </p>
          <Link to="/watch" className="mt-6 inline-block">
            <GoldButton>Browse live games</GoldButton>
          </Link>
        </Card>
      </PageShell>
    );
  }

  if (loading && !game) {
    return (
      <PageShell compact>
        <div className="flex items-center justify-center gap-2 py-32 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Tuning in…
        </div>
      </PageShell>
    );
  }

  if (!game) {
    return (
      <PageShell title="Game not found" compact>
        <Card className="mx-auto max-w-lg p-10 text-center text-sm text-muted-foreground">
          {error ?? "This game does not exist or has been removed."}
          <div className="mt-6">
            <Link to="/watch">
              <GoldButton>Browse live games</GoldButton>
            </Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  const finished = game.status === "finished";
  const turn = fen.split(" ")[1] === "b" ? "b" : "w";
  const orientation = flipped ? "b" : "w";
  const winnerColor = game.result === "white" ? "w" : game.result === "black" ? "b" : null;

  return (
    <PageShell compact>
      <div ref={shellRef} className="bg-page">
        {/* ---- Header ---------------------------------------------- */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link
            to="/watch"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-gold"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            All live games
          </Link>

          <DelayBadge
            delaySeconds={game.delay_seconds}
            movesBehind={game.moves_behind}
            isPlayer={game.is_player}
            finished={finished}
          />

          <span className="royal-chip text-[11px]">{TIME_CLASS_LABEL[game.time_class]}</span>
          <span className="text-xs text-muted-foreground">{game.time_control}</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
              game.is_rated
                ? "border-gold/30 bg-gold/10 text-gold"
                : "border-white/10 bg-white/[0.03] text-muted-foreground"
            }`}
          >
            {game.is_rated ? "Ranked" : "Casual"}
          </span>

          {game.tournament && (
            <Link
              to="/tournament/$id"
              params={{ id: game.tournament.tournament_id }}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald/30 bg-emerald/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-emerald transition-colors hover:bg-emerald/20"
            >
              <Trophy className="h-3 w-3" aria-hidden />
              {game.tournament.name}
              {game.tournament.is_final ? " · Final" : ` · Round ${game.tournament.round}`}
            </Link>
          )}

          <ViewerCount count={viewers} className="ml-auto" />
        </div>

        {/* A dropped poll is worth saying out loud — a frozen board with
            no explanation looks like the game stopped. */}
        {error && !forbidden && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <WifiOff className="h-3.5 w-3.5" aria-hidden />
            Reconnecting to the broadcast…
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ---- Board column ------------------------------------- */}
          <div>
            <Card className="p-4 md:p-5">
              <SpectatorPlayerBar
                player={orientation === "w" ? game.black : game.white}
                color={orientation === "w" ? "b" : "w"}
                active={!finished && turn === (orientation === "w" ? "b" : "w")}
                board={board}
                isWinner={winnerColor === (orientation === "w" ? "b" : "w")}
                className="mb-3"
              />

              <InteractiveBoard
                board={board}
                orientation={orientation}
                lastMove={lastMove}
                checkSquare={checkSquare}
                disabled
                endState={
                  finished && game.result !== "ongoing" && game.result !== "aborted"
                    ? { result: game.result, reason: game.end_reason ?? "" }
                    : null
                }
              />

              <SpectatorPlayerBar
                player={orientation === "w" ? game.white : game.black}
                color={orientation === "w" ? "w" : "b"}
                active={!finished && turn === orientation}
                board={board}
                isWinner={winnerColor === orientation}
                className="mt-3"
              />
            </Card>

            <div className="mt-3">
              <SpectatorControls
                controls={controls}
                available={available}
                ply={ply}
                flipped={flipped}
                onFlip={() => setFlipped((v) => !v)}
                fullscreen={fullscreen}
                onToggleFullscreen={toggleFullscreen}
                finished={finished}
              />
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              {delayExplanation(game)}
            </p>

            {game.is_player && (
              <Card className="mt-3 flex flex-wrap items-center gap-3 border-gold/25 p-3">
                <Swords className="h-4 w-4 shrink-0 text-gold" aria-hidden />
                <span className="flex-1 text-xs text-muted-foreground">
                  This is your game — you are seeing it live. Open the board to play your moves.
                </span>
                <Link to="/game/$id" params={{ id }}>
                  <GhostButton className="px-3 py-1.5 text-xs">Go to my board</GhostButton>
                </Link>
              </Card>
            )}
          </div>

          {/* ---- Side rail ---------------------------------------- */}
          <div className="space-y-4">
            {finished && (
              <Card className="p-4 text-center">
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Result
                </div>
                <div className="mt-2 text-lg text-gradient-gold">{resultLabel(game.result)}</div>
                {game.end_reason && (
                  <div className="mt-1 text-xs capitalize text-muted-foreground">
                    by {game.end_reason}
                  </div>
                )}
                <Link to="/game/$id/review" params={{ id }} className="mt-4 inline-block">
                  <GoldButton className="px-4 py-2 text-xs">Full game review</GoldButton>
                </Link>
              </Card>
            )}

            <Card className="p-4">
              <h2 className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Live statistics
              </h2>
              <LiveStatsPanel stats={stats} opening={opening} />
            </Card>

            <Card className="overflow-hidden p-0">
              <h2 className="border-b border-white/5 px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Moves
              </h2>
              <MoveList
                moves={game.moves}
                currentPly={ply}
                onJump={(target) => controls.jumpTo(target)}
              />
            </Card>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function resultLabel(result: string): string {
  if (result === "white") return "White wins";
  if (result === "black") return "Black wins";
  if (result === "draw") return "Draw";
  if (result === "aborted") return "Aborted";
  return "In progress";
}
