// =====================================================================
// Game tree — moves, nested variations, comments and NAG annotations
// ---------------------------------------------------------------------
// The analysis room's core data structure. A game is a tree of positions:
// each node is one played move; a node's first child continues the line
// it is on, later children open side variations. The root is a pseudo-
// node holding the starting position (standard or from a FEN).
//
// The tree is intentionally mutable — analysis edits (adding a line,
// promoting a variation, annotating a move) mutate in place and bump
// `version`, which React state uses as its invalidation signal. This
// keeps large games (500+ nodes with variations) allocation-free during
// navigation.
// =====================================================================
import { Chess } from "chess.js";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const ROOT_ID = "root";

/** Numeric Annotation Glyphs we understand (superset stored, subset shown). */
export const NAG_GLYPH: Record<number, string> = {
  1: "!",
  2: "?",
  3: "!!",
  4: "??",
  5: "!?",
  6: "?!",
  7: "□", // forced / only move
  10: "=",
  13: "∞",
  14: "⩲",
  15: "⩱",
  16: "±",
  17: "∓",
  18: "+−",
  19: "−+",
};

export type MoveNode = {
  id: string;
  /** null only on the root pseudo-node. */
  parentId: string | null;
  /** children[0] continues this line; children[1..] are side variations. */
  children: string[];
  san: string;
  /** UCI long algebraic (e2e4, e7e8q). Empty on root. */
  uci: string;
  fenAfter: string;
  /** 1-based ply counting from the root position (root itself is 0). */
  ply: number;
  /** Fullmove number of this move (from the position it was played in). */
  moveNumber: number;
  color: "w" | "b";
  comment: string | null;
  nags: number[];
  /** Optional clock reading parsed from `[%clk]` comments, in seconds. */
  clockSeconds: number | null;
};

export type TreeMove = { from: string; to: string; promotion?: string };

/** Fullmove number and side to move straight from a FEN. */
function fenTurnInfo(fen: string): { turn: "w" | "b"; moveNumber: number } {
  const parts = fen.split(" ");
  return {
    turn: (parts[1] as "w" | "b") ?? "w",
    moveNumber: Number(parts[5]) || 1,
  };
}

export class GameTree {
  readonly rootFen: string;
  /** Bumped on every structural or annotation change. */
  version = 0;

  private nodes = new Map<string, MoveNode>();
  private counter = 0;

  constructor(rootFen?: string) {
    this.rootFen = rootFen ?? START_FEN;
    // Validate eagerly — a bad FEN should fail at construction, not on
    // first navigation.
    new Chess(this.rootFen);
    this.nodes.set(ROOT_ID, {
      id: ROOT_ID,
      parentId: null,
      children: [],
      san: "",
      uci: "",
      fenAfter: this.rootFen,
      ply: 0,
      moveNumber: fenTurnInfo(this.rootFen).moveNumber,
      color: fenTurnInfo(this.rootFen).turn === "w" ? "b" : "w",
      comment: null,
      nags: [],
      clockSeconds: null,
    });
  }

  // ── Reads ──────────────────────────────────────────────────────────

  get root(): MoveNode {
    return this.nodes.get(ROOT_ID)!;
  }

  node(id: string): MoveNode | null {
    return this.nodes.get(id) ?? null;
  }

  /** Number of move nodes (excludes the root). */
  get size(): number {
    return this.nodes.size - 1;
  }

  /** The path of move nodes from the root to `id` (root excluded). */
  path(id: string): MoveNode[] {
    const out: MoveNode[] = [];
    let cur = this.nodes.get(id);
    while (cur && cur.parentId !== null) {
      out.push(cur);
      cur = this.nodes.get(cur.parentId);
    }
    return out.reverse();
  }

  /** Mainline: follow first children from the root. */
  mainline(): MoveNode[] {
    const out: MoveNode[] = [];
    let cur = this.root;
    while (cur.children.length > 0) {
      cur = this.nodes.get(cur.children[0])!;
      out.push(cur);
    }
    return out;
  }

  /** True when every ancestor step of `id` runs along a first child. */
  isMainline(id: string): boolean {
    let cur = this.nodes.get(id);
    while (cur && cur.parentId !== null) {
      const parent = this.nodes.get(cur.parentId)!;
      if (parent.children[0] !== cur.id) return false;
      cur = parent;
    }
    return true;
  }

  next(id: string): MoveNode | null {
    const n = this.nodes.get(id);
    return n && n.children.length > 0 ? this.nodes.get(n.children[0])! : null;
  }

  prev(id: string): MoveNode | null {
    const n = this.nodes.get(id);
    return n && n.parentId !== null ? this.nodes.get(n.parentId)! : null;
  }

  /** Last node of the line `id` sits on (following first children). */
  endOfLine(id: string): MoveNode {
    let cur = this.nodes.get(id) ?? this.root;
    while (cur.children.length > 0) cur = this.nodes.get(cur.children[0])!;
    return cur;
  }

  /** Sibling variations at the same branching point as `id` (excludes `id`). */
  variationsOf(id: string): MoveNode[] {
    const n = this.nodes.get(id);
    if (!n || n.parentId === null) return [];
    const parent = this.nodes.get(n.parentId)!;
    return parent.children.filter((c) => c !== id).map((c) => this.nodes.get(c)!);
  }

  /** All nodes in pre-order (mainline before variations at each branch). */
  *walk(fromId: string = ROOT_ID): Generator<MoveNode> {
    const start = this.nodes.get(fromId);
    if (!start) return;
    const stack: string[] = [...start.children].reverse();
    while (stack.length > 0) {
      const n = this.nodes.get(stack.pop()!)!;
      yield n;
      for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
    }
  }

  /** A chess.js instance at the position after `id`. */
  positionAt(id: string): Chess {
    const n = this.nodes.get(id) ?? this.root;
    return new Chess(n.fenAfter);
  }

  // ── Mutations ──────────────────────────────────────────────────────

  /**
   * Play a move from the position after `parentId`. If the same move
   * already exists as a child it is reused (transparent transposition
   * into an existing line); otherwise a new node is appended — as the
   * mainline continuation when the parent had no children, else as a
   * new side variation. Returns null for illegal moves.
   */
  play(parentId: string, move: TreeMove | string): MoveNode | null {
    const parent = this.nodes.get(parentId);
    if (!parent) return null;

    const chess = new Chess(parent.fenAfter);
    let made;
    try {
      made = chess.move(
        typeof move === "string" ? move : { ...move, promotion: (move.promotion ?? "q") as "q" },
      );
    } catch {
      return null;
    }

    const existing = parent.children.map((c) => this.nodes.get(c)!).find((c) => c.san === made.san);
    if (existing) return existing;

    const info = fenTurnInfo(parent.fenAfter);
    const node: MoveNode = {
      id: `n${++this.counter}`,
      parentId: parent.id,
      children: [],
      san: made.san,
      uci: made.from + made.to + (made.promotion ?? ""),
      fenAfter: chess.fen(),
      ply: parent.ply + 1,
      moveNumber: info.moveNumber,
      color: made.color,
      comment: null,
      nags: [],
      clockSeconds: null,
    };
    this.nodes.set(node.id, node);
    parent.children.push(node.id);
    this.version++;
    return node;
  }

  /** Make `id` the first child of its parent (promote the variation). */
  promote(id: string): void {
    const n = this.nodes.get(id);
    if (!n || n.parentId === null) return;
    const parent = this.nodes.get(n.parentId)!;
    const idx = parent.children.indexOf(id);
    if (idx <= 0) return;
    parent.children.splice(idx, 1);
    parent.children.unshift(id);
    this.version++;
  }

  /** Delete `id` and its entire subtree. Root cannot be deleted. */
  delete(id: string): void {
    const n = this.nodes.get(id);
    if (!n || n.parentId === null) return;
    const parent = this.nodes.get(n.parentId)!;
    parent.children = parent.children.filter((c) => c !== id);
    const stack = [id];
    while (stack.length > 0) {
      const cur = this.nodes.get(stack.pop()!)!;
      stack.push(...cur.children);
      this.nodes.delete(cur.id);
    }
    this.version++;
  }

  setComment(id: string, comment: string | null): void {
    const n = this.nodes.get(id);
    if (!n) return;
    n.comment = comment && comment.trim() ? comment.trim() : null;
    this.version++;
  }

  setClock(id: string, seconds: number | null): void {
    const n = this.nodes.get(id);
    if (!n) return;
    n.clockSeconds = seconds;
    this.version++;
  }

  /** Toggle a NAG; move-quality NAGs (1–6) are mutually exclusive. */
  toggleNag(id: string, nag: number): void {
    const n = this.nodes.get(id);
    if (!n || n.parentId === null) return;
    if (n.nags.includes(nag)) {
      n.nags = n.nags.filter((x) => x !== nag);
    } else {
      const isQuality = nag >= 1 && nag <= 6;
      n.nags = [...n.nags.filter((x) => !(isQuality && x >= 1 && x <= 6)), nag].sort(
        (a, b) => a - b,
      );
    }
    this.version++;
  }

  /**
   * Append a mainline sequence of SAN moves (used by import and by
   * "load game" flows). Stops at the first illegal move and reports how
   * many were applied.
   */
  appendMainline(sans: string[]): { applied: number; lastId: string } {
    let cursor = this.endOfLine(ROOT_ID);
    let applied = 0;
    for (const san of sans) {
      const next = this.play(cursor.id, san);
      if (!next) break;
      cursor = next;
      applied++;
    }
    return { applied, lastId: cursor.id };
  }
}
