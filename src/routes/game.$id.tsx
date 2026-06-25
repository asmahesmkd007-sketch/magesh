import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Chess, type Square } from "chess.js";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { InteractiveBoard, type BoardCell } from "@/components/site/InteractiveBoard";
import { PromotionPicker } from "@/components/site/PromotionPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Flag, Handshake, Copy, Send, Crown, MessageCircle, Swords } from "lucide-react";

export const Route = createFileRoute("/game/$id")({
  head: () => ({ meta: [{ title: "Live Game — ChessOx" }] }),
  component: LiveGame,
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
  fen: string;
  turn: string;
  status: string;
  result: string;
  time_control: string;
  initial_seconds: number;
  increment_seconds: number;
  white_time_ms: number;
  black_time_ms: number;
  last_move_at: string | null;
  host_id: string | null;
  winner_id: string | null;
  draw_offered_by: string | null;
  end_reason: string | null;
  is_rated: boolean;
  time_class: "bullet" | "blitz" | "rapid" | "classical";
};

type MoveRow = { ply: number; san: string; uci: string; fen_after: string };
type ChatRow = { id: number; username: string; user_id: string; body: string; created_at: string };

function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function LiveGame() {
  const { id } = useParams({ from: "/game/$id" });
  const { user } = useAuth();
  const [game, setGame] = useState<GameRow | null>(null);
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [chat, setChat] = useState<ChatRow[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [joining, setJoining] = useState(false);

  const chess = useMemo(() => {
    const c = new Chess();
    if (game?.fen) { try { c.load(game.fen); } catch { /* noop */ } }
    return c;
  }, [game?.fen]);

  // Initial load
  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: g }, { data: m }, { data: c }] = await Promise.all([
        supabase.from("games").select("*").eq("id", id).maybeSingle(),
        supabase.from("game_moves").select("ply,san,uci,fen_after").eq("game_id", id).order("ply"),
        supabase.from("game_chat").select("id,user_id,username,body,created_at").eq("game_id", id).order("created_at"),
      ]);
      if (!alive) return;
      setGame(g as GameRow | null);
      setMoves((m ?? []) as MoveRow[]);
      setChat((c ?? []) as ChatRow[]);
    })();
    return () => { alive = false; };
  }, [id]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel(`game:${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${id}` },
        (p) => setGame(p.new as GameRow))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_moves", filter: `game_id=eq.${id}` },
        (p) => setMoves((prev) => {
          const row = p.new as MoveRow;
          if (prev.some((r) => r.ply === row.ply)) return prev;
          return [...prev, row].sort((a, b) => a.ply - b.ply);
        }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_chat", filter: `game_id=eq.${id}` },
        (p) => setChat((prev) => [...prev, p.new as ChatRow]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  // Clock tick
  useEffect(() => {
    if (!game || game.status !== "active") return;
    const t = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [game?.status]);

  if (!game) return <PageShell title="Loading throne…"><div /></PageShell>;

  const myColor: "w" | "b" | null =
    user && game.white_id === user.id ? "w" : user && game.black_id === user.id ? "b" : null;
  const orientation = myColor ?? "w";
  const isMyTurn = !!myColor && myColor === game.turn && game.status === "active";

  // Live clock display
  const elapsed = game.last_move_at && game.status === "active"
    ? Date.now() - new Date(game.last_move_at).getTime()
    : 0;
  void tick;
  const whiteMs = game.turn === "w" ? game.white_time_ms - elapsed : game.white_time_ms;
  const blackMs = game.turn === "b" ? game.black_time_ms - elapsed : game.black_time_ms;

  // Board cells
  const board: BoardCell[][] = chess.board().map((row) =>
    row.map((p) => (p ? { square: p.square, type: p.type, color: p.color } : null)),
  );
  const lastMove = moves.length
    ? (() => {
        const u = moves[moves.length - 1].uci;
        return { from: u.slice(0, 2), to: u.slice(2, 4) };
      })()
    : null;
  const inCheck = chess.inCheck();
  const checkSquare = inCheck
    ? (chess.board().flat().find((p) => p && p.type === "k" && p.color === chess.turn())?.square ?? null)
    : null;

  async function handleSquare(sq: string) {
    if (!isMyTurn || promotion) return;
    const square = sq as Square;
    if (selected) {
      const moveList = chess.moves({ square: selected as Square, verbose: true });
      const m = moveList.find((mv) => mv.to === square);
      if (m) {
        if (m.promotion === undefined && (m.piece === "p" && (square[1] === "8" || square[1] === "1"))) {
          setPromotion({ from: selected, to: square }); return;
        }
        if (m.flags.includes("p")) {
          setPromotion({ from: selected, to: square }); return;
        }
        await commitMove(selected, square, undefined);
        setSelected(null); setTargets([]);
        return;
      }
    }
    const piece = chess.get(square);
    if (piece && piece.color === game!.turn && piece.color === myColor) {
      setSelected(sq);
      setTargets(chess.moves({ square, verbose: true }).map((m) => m.to));
    } else {
      setSelected(null); setTargets([]);
    }
  }

  async function commitMove(from: string, to: string, promo?: "q" | "r" | "b" | "n") {
    if (!game || !user || !myColor) return;
    const local = new Chess(game.fen);
    const m = local.move({ from, to, promotion: promo });
    if (!m) return;
    const now = Date.now();
    const sinceLast = game.last_move_at ? now - new Date(game.last_move_at).getTime() : 0;
    const myTimeMs = (myColor === "w" ? game.white_time_ms : game.black_time_ms) - sinceLast + game.increment_seconds * 1000;
    if (myTimeMs <= 0) { await endByFlag(); return; }

    const newPly = moves.length + 1;
    const fenAfter = local.fen();
    const nextTurn = local.turn();
    const newPgn = local.pgn();
    let status = "active";
    let result: string = "ongoing";
    let winnerId: string | null = null;
    let endReason: string | null = null;
    if (local.isCheckmate()) {
      status = "finished";
      result = myColor === "w" ? "white" : "black";
      winnerId = user.id;
      endReason = "checkmate";
    } else if (local.isDraw() || local.isStalemate() || local.isThreefoldRepetition() || local.isInsufficientMaterial()) {
      status = "finished";
      result = "draw";
      endReason = local.isStalemate() ? "stalemate" : local.isThreefoldRepetition() ? "repetition" : local.isInsufficientMaterial() ? "insufficient" : "fifty-move";
    }

    // Optimistic local update
    setGame({ ...game, fen: fenAfter, turn: nextTurn, last_move_at: new Date(now).toISOString(),
      white_time_ms: myColor === "w" ? myTimeMs : game.white_time_ms,
      black_time_ms: myColor === "b" ? myTimeMs : game.black_time_ms,
      status, result, winner_id: winnerId, end_reason: endReason, pgn: newPgn });

    const uci = `${from}${to}${promo ?? ""}`;
    await supabase.from("game_moves").insert({
      game_id: id, ply: newPly, san: m.san, uci, fen_after: fenAfter, by_user: user.id, time_left_ms: myTimeMs,
    });
    const patch: Record<string, unknown> = {
      fen: fenAfter, turn: nextTurn, last_move_at: new Date(now).toISOString(),
      pgn: newPgn, moves_count: newPly, status, result,
    };
    if (myColor === "w") patch.white_time_ms = myTimeMs; else patch.black_time_ms = myTimeMs;
    if (status === "finished") {
      patch.winner_id = winnerId;
      patch.end_reason = endReason;
      patch.ended_at = new Date().toISOString();
    }
    await supabase.from("games").update(patch as never).eq("id", id);
    if (status === "finished") await applyRatings(result, winnerId);
  }

  async function applyRatings(result: string, winnerId: string | null) {
    if (!game || !game.is_rated || !game.white_id || !game.black_id) return;
    const cls = game.time_class;
    if (!cls) return;
    const { data: ratings } = await supabase.from("ratings")
      .select("user_id, rating, games_played").in("user_id", [game.white_id, game.black_id]).eq("time_class", cls);
    if (!ratings) return;
    const w = ratings.find((r) => r.user_id === game.white_id);
    const b = ratings.find((r) => r.user_id === game.black_id);
    if (!w || !b) return;
    const K = 24;
    const exp = (a: number, c: number) => 1 / (1 + Math.pow(10, (c - a) / 400));
    const wScore = result === "white" ? 1 : result === "draw" ? 0.5 : 0;
    const bScore = 1 - wScore;
    const newW = Math.round(w.rating + K * (wScore - exp(w.rating, b.rating)));
    const newB = Math.round(b.rating + K * (bScore - exp(b.rating, w.rating)));
    await supabase.from("ratings").update({ rating: newW, games_played: w.games_played + 1 } as never).eq("user_id", game.white_id).eq("time_class", cls);
    await supabase.from("ratings").update({ rating: newB, games_played: b.games_played + 1 } as never).eq("user_id", game.black_id).eq("time_class", cls);
    void winnerId;
  }

  async function endByFlag() {
    if (!game || !myColor) return;
    const winner = myColor === "w" ? "black" : "white";
    const winnerId = myColor === "w" ? game.black_id : game.white_id;
    await supabase.from("games").update({
      status: "finished", result: winner, winner_id: winnerId, end_reason: "timeout", ended_at: new Date().toISOString(),
    } as never).eq("id", id);
    await applyRatings(winner, winnerId);
  }

  async function joinAsOpponent() {
    if (!user || !game || game.status !== "waiting") return;
    if (game.white_id === user.id || game.black_id === user.id) return;
    setJoining(true);
    const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
    const username = profile?.username ?? "Player";
    const patch: Record<string, unknown> = {
      status: "active",
      last_move_at: new Date().toISOString(),
    };
    if (!game.white_id) { patch.white_id = user.id; patch.white_username = username; }
    else { patch.black_id = user.id; patch.black_username = username; }
    await supabase.from("games").update(patch as never).eq("id", id);
    setJoining(false);
  }

  async function resign() {
    if (!game || !myColor || game.status !== "active") return;
    if (!confirm("Resign this game?")) return;
    const winner = myColor === "w" ? "black" : "white";
    const winnerId = myColor === "w" ? game.black_id : game.white_id;
    await supabase.from("games").update({
      status: "finished", result: winner, winner_id: winnerId, end_reason: "resignation", ended_at: new Date().toISOString(),
    } as never).eq("id", id);
    await applyRatings(winner, winnerId);
  }

  async function offerDraw() {
    if (!game || !myColor || game.status !== "active") return;
    if (game.draw_offered_by && game.draw_offered_by !== user!.id) {
      await supabase.from("games").update({
        status: "finished", result: "draw", end_reason: "agreement", ended_at: new Date().toISOString(), draw_offered_by: null,
      } as never).eq("id", id);
      await applyRatings("draw", null);
    } else {
      await supabase.from("games").update({ draw_offered_by: user!.id } as never).eq("id", id);
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || !user) return;
    const body = chatInput.trim().slice(0, 500);
    const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
    setChatInput("");
    await supabase.from("game_chat").insert({ game_id: id, user_id: user.id, username: profile?.username ?? "Player", body });
  }

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/game/${id}` : "";
  const opp = myColor === "w"
    ? { name: game.black_username ?? "Awaiting…", rating: game.black_rating, ms: blackMs }
    : { name: game.white_username ?? "Awaiting…", rating: game.white_rating, ms: whiteMs };
  const me = myColor
    ? (myColor === "w"
        ? { name: game.white_username ?? "You", rating: game.white_rating, ms: whiteMs }
        : { name: game.black_username ?? "You", rating: game.black_rating, ms: blackMs })
    : { name: "Spectator", rating: null, ms: 0 };

  const isWaiting = game.status === "waiting";
  const isFinished = game.status === "finished";
  const canJoin = isWaiting && !!user && (!game.white_id || !game.black_id) && game.host_id !== user.id;
  const isHostWaiting = isWaiting && user?.id === game.host_id;

  return (
    <PageShell>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-3">
          <PlayerCard name={opp.name} rating={opp.rating} ms={opp.ms} active={!isWaiting && game.turn !== myColor} />
          <PlayerCard name={me.name} rating={me.rating} ms={me.ms} active={!isWaiting && game.turn === myColor} me />

          {isHostWaiting && (
            <Card className="p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-gold/80">Awaiting opponent</div>
              <p className="mt-2 text-sm text-muted-foreground">Share this scroll to summon a challenger.</p>
              <div className="mt-3 flex gap-2">
                <input readOnly value={shareUrl} className="flex-1 rounded-lg border border-gold/30 bg-white/[0.02] px-2 py-1.5 font-mono text-[11px]" />
                <button onClick={() => navigator.clipboard.writeText(shareUrl)} className="grid h-8 w-8 place-items-center rounded-lg gradient-gold text-[#0B0D10]">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </Card>
          )}

          {canJoin && (
            <Card className="p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-gold/80">Accept Challenge</div>
              <p className="mt-2 text-sm text-muted-foreground">{game.time_control} · {game.is_rated ? "Rated" : "Casual"}</p>
              <div className="mt-3"><GoldButton onClick={joinAsOpponent} disabled={joining}><Swords className="h-4 w-4" /> Enter the Arena</GoldButton></div>
            </Card>
          )}

          {!user && isWaiting && (
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Sign in to accept this challenge.</p>
              <div className="mt-3"><Link to="/auth"><GoldButton>Sign in</GoldButton></Link></div>
            </Card>
          )}

          {isFinished && (
            <Card className="p-4 text-center">
              <Crown className="mx-auto h-6 w-6 text-gold" />
              <div className="mt-2 font-display text-2xl text-gradient-gold">
                {game.result === "draw" ? "Draw" : game.result === "white" ? "White Wins" : "Black Wins"}
              </div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{game.end_reason}</div>
              <div className="mt-4 flex justify-center gap-2">
                <Link to="/play/friend"><GoldButton>New Challenge</GoldButton></Link>
              </div>
            </Card>
          )}
        </div>

        <div className="lg:col-span-6">
          <InteractiveBoard
            board={board}
            orientation={orientation}
            selected={selected}
            targets={targets}
            lastMove={lastMove}
            checkSquare={checkSquare}
            onSquare={handleSquare}
            disabled={!isMyTurn || !!promotion}
          />
          {promotion && (
            <div className="mt-4 flex justify-center">
              <PromotionPicker color={myColor!}
                onCancel={() => setPromotion(null)}
                onPick={(p) => {
                  const { from, to } = promotion;
                  setPromotion(null);
                  void commitMove(from, to, p);
                  setSelected(null); setTargets([]);
                }} />
            </div>
          )}
          {!isWaiting && !isFinished && myColor && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <GhostButton onClick={offerDraw}>
                <Handshake className="h-4 w-4" />
                {game.draw_offered_by && game.draw_offered_by !== user?.id ? "Accept Draw" : "Offer Draw"}
              </GhostButton>
              <GoldButton onClick={resign} className="bg-destructive text-foreground"><Flag className="h-4 w-4" /> Resign</GoldButton>
            </div>
          )}
        </div>

        <div className="space-y-4 lg:col-span-3">
          <Card className="p-4">
            <div className="mb-2 font-display">Moves</div>
            <div className="grid max-h-72 grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 overflow-y-auto pr-2 text-sm scrollbar-thin">
              {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => (
                <div className="contents" key={i}>
                  <div className="text-muted-foreground">{i + 1}.</div>
                  <div>{moves[i * 2]?.san ?? ""}</div>
                  <div className="text-muted-foreground">{moves[i * 2 + 1]?.san ?? ""}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2 text-sm"><MessageCircle className="h-4 w-4 text-gold" /> Chat</div>
            <div className="h-40 space-y-1 overflow-y-auto rounded-lg bg-white/[0.02] p-2 text-xs scrollbar-thin">
              {chat.map((c) => (
                <div key={c.id}><span className="text-gold">{c.username}:</span> {c.body}</div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
                placeholder={user ? "Type a message…" : "Sign in to chat"}
                disabled={!user}
                className="flex-1 rounded-full border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40" />
              <button onClick={sendChat} className="grid h-9 w-9 place-items-center rounded-full gradient-gold text-[#0B0D10]"><Send className="h-4 w-4" /></button>
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

function PlayerCard({ name, rating, ms, active, me }: { name: string; rating: number | null; ms: number; active?: boolean; me?: boolean }) {
  return (
    <Card className={`p-4 ${active ? "ring-1 ring-gold/60" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-full gradient-gold font-display text-[#0B0D10]">
          {name[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm">{name}</div>
          <div className="text-xs text-muted-foreground">{rating ?? "—"} {me ? "· You" : ""}</div>
        </div>
        <div className={`rounded-lg px-3 py-1.5 font-mono text-sm tabular-nums ${active ? "bg-gold text-[#0B0D10]" : "bg-white/5"}`}>
          {fmtClock(ms)}
        </div>
      </div>
    </Card>
  );
}
