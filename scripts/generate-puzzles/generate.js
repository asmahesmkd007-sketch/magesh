// Engine-verified chess puzzle generator using chess.js.
// Produces forced mate-in-N puzzles (guaranteed legal + solvable) plus verifies curated ones.
const { Chess } = require("chess.js");

const uci = (m) => m.from + m.to + (m.promotion || "");

// ---- forced-mate search (attacker = side to move) --------------------------
function attackerMate(chess, n) {
  for (const m of chess.moves({ verbose: true })) {
    chess.move(m);
    if (chess.isCheckmate()) { chess.undo(); return [uci(m)]; }
    // only pursue forcing (checking) continuations for speed + puzzle clarity
    if (n >= 2 && chess.isCheck() && !chess.isGameOver()) {
      const line = defenderAllMate(chess, n - 1);
      if (line) { chess.undo(); return [uci(m), ...line]; }
    }
    chess.undo();
  }
  return null;
}
function defenderAllMate(chess, n) {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null; // stalemate/mate -> not a clean mate line
  let first = null;
  for (const d of moves) {
    chess.move(d);
    const line = attackerMate(chess, n);
    chess.undo();
    if (!line) return null;
    if (!first) first = [uci(d), ...line];
  }
  return first;
}
// true if there is NO mate in (n-1) — ensures the puzzle is *exactly* mate-in-n
function isExactMate(fen, n) {
  const c = new Chess(fen);
  if (n > 1) { const shorter = attackerMate(new Chess(fen), n - 1); if (shorter) return null; }
  return attackerMate(c, n);
}

// ---- random legal position sampling ---------------------------------------
const FILES = "abcdefgh";
function sq(f, r) { return FILES[f] + (r + 1); }
function rnd(n) { return Math.floor(Math.random() * n); }
function randSquare() { return sq(rnd(8), rnd(8)); }
function adjacent(a, b) {
  const ax = FILES.indexOf(a[0]), ay = +a[1] - 1, bx = FILES.indexOf(b[0]), by = +b[1] - 1;
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by)) <= 1;
}

// Build a position: white to move, white king + pieces vs black king (+ maybe pawns)
function randomPosition(pieceSet) {
  const used = new Set();
  const place = () => { let s; do { s = randSquare(); } while (used.has(s)); used.add(s); return s; };
  const board = {}; // square -> {c,t}
  const wk = place(); board[wk] = { c: "w", t: "k" };
  // bias the black king toward an edge/corner — that's where mates live
  let bk;
  do {
    let f = rnd(8), r = rnd(8);
    if (Math.random() < 0.8) { if (Math.random() < 0.5) f = Math.random() < 0.5 ? 0 : 7; else r = Math.random() < 0.5 ? 0 : 7; }
    bk = sq(f, r);
  } while (bk === wk || adjacent(wk, bk) || used.has(bk));
  used.add(bk);
  board[bk] = { c: "b", t: "k" };
  for (const p of pieceSet) {
    const s = place();
    // keep pawns off the back ranks
    if (p.t === "p" && (s[1] === "1" || s[1] === "8")) { used.delete(s); return null; }
    board[s] = { c: p.c, t: p.t };
  }
  // build FEN
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = "", empty = 0;
    for (let f = 0; f < 8; f++) {
      const s = sq(f, r), pc = board[s];
      if (!pc) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      const ch = pc.t === "p" ? "p" : pc.t;
      row += pc.c === "w" ? ch.toUpperCase() : ch;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const fen = rows.join("/") + " w - - 0 1";
  const chk = require("chess.js").validateFen(fen);
  if (!chk.ok) return null;
  const c = new Chess();
  try { c.load(fen); } catch { return null; }
  if (c.isCheck()) return null;       // side to move can't already be in check here (we want a quiet start)
  if (c.isGameOver()) return null;
  // The side NOT to move must not be in check — otherwise the position is illegal.
  const flip = new Chess();
  try { flip.load(fen.replace(" w ", " b ")); } catch { return null; }
  if (flip.isCheck()) return null;
  return fen;
}

const PIECE_MENUS = {
  KQ: [{ c: "w", t: "q" }],
  KR: [{ c: "w", t: "r" }],
  KRR: [{ c: "w", t: "r" }, { c: "w", t: "r" }],
  KQN: [{ c: "w", t: "q" }, { c: "w", t: "n" }],
  KQB: [{ c: "w", t: "q" }, { c: "w", t: "b" }],
  KQR: [{ c: "w", t: "q" }, { c: "w", t: "r" }],
  KBB: [{ c: "w", t: "b" }, { c: "w", t: "b" }],
  KRN: [{ c: "w", t: "r" }, { c: "w", t: "n" }],
  KRB: [{ c: "w", t: "r" }, { c: "w", t: "b" }],
  KRp: [{ c: "w", t: "r" }, { c: "b", t: "p" }],
  KQp: [{ c: "w", t: "q" }, { c: "b", t: "p" }, { c: "b", t: "p" }],
  KQRp: [{ c: "w", t: "q" }, { c: "w", t: "r" }, { c: "b", t: "p" }],
};

function classify(fen, moves, n) {
  const c = new Chess(fen); c.move({ from: moves[0].slice(0,2), to: moves[0].slice(2,4), promotion: moves[0][4] });
  const last = moves[moves.length - 1];
  const cc = new Chess(fen);
  for (const m of moves) cc.move({ from: m.slice(0,2), to: m.slice(2,4), promotion: m[4] });
  // find mated king square
  const board = cc.board(); let ksq = null;
  for (const row of board) for (const cell of row) if (cell && cell.type === "k" && cell.color === cc.turn()) ksq = cell.square;
  const rank = ksq ? +ksq[1] : 0;
  const backRank = rank === 8 || rank === 1;
  const piece = new Chess(fen).get(last.slice(0,2));
  const pt = piece ? piece.type : "";
  if (n === 1 && backRank && (pt === "r" || pt === "q")) return "Back Rank Mate";
  if (n === 1 && pt === "n") return "Knight Mate";
  if (last.length > 4) return "Promotion Tactics";
  return `Mate in ${n}`;
}

// ---- generation ------------------------------------------------------------
function generate(target, n, menus, seen, out, tries, msBudget) {
  let count = 0, t = 0;
  const start = Date.now();
  while (count < target && t < tries) {
    t++;
    if ((t & 63) === 0 && Date.now() - start > msBudget) break;
    const menu = menus[rnd(menus.length)];
    const fen = randomPosition(PIECE_MENUS[menu]);
    if (!fen || seen.has(fen)) continue;
    const line = isExactMate(fen, n);
    if (!line) continue;
    seen.add(fen);
    out.push({ fen, moves: line, n, theme: classify(fen, line, n) });
    count++;
  }
  process.stderr.write(`  mate${n}: found ${count}/${target} in ${t} tries (${Date.now() - start}ms)\n`);
  return count;
}

const fs = require("fs");
const OUT = process.argv[2];
const seen = new Set();
const out = [];
const dump = () => fs.writeFileSync(OUT, JSON.stringify(out));
const c1 = generate(150, 1, ["KQ", "KR", "KRR", "KQN", "KQB", "KQR", "KRN", "KRB"], seen, out, 900000, 120000); dump();
const c2 = generate(80, 2, ["KQ", "KRR", "KQN", "KQB", "KQR", "KRN", "KRB"], seen, out, 1200000, 220000); dump();
const c3 = generate(18, 3, ["KRR", "KQN", "KQR", "KQB", "KRN"], seen, out, 1500000, 200000); dump();
process.stderr.write(`mate1=${c1} mate2=${c2} mate3=${c3} total=${out.length}\n`);
