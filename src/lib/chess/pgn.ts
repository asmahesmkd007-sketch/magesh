// =====================================================================
// PGN import / export
// ---------------------------------------------------------------------
// A tolerant PGN reader and a spec-shaped writer built around GameTree.
//
// The reader preserves what matters for analysis — comments, nested
// variations (RAVs), NAGs, and embedded clock tags — and recovers from
// the malformed PGN found in the wild: glued move numbers ("1.e4"),
// zero-style castling ("0-0"), stray annotation suffixes, missing
// results, headers with sloppy spacing. Anything it cannot understand
// becomes a warning rather than a hard failure wherever a legal game
// prefix can still be extracted.
//
// The writer emits standard movetext (variations in parens, comments in
// braces, quality NAGs as suffix glyphs, others as $n) wrapped at 80
// columns, with the Seven Tag Roster always present and FEN/SetUp tags
// when the game starts from a custom position.
// =====================================================================
import { Chess } from "chess.js";

import { GameTree, ROOT_ID, START_FEN, type MoveNode } from "./moveTree";

export type ParsedPgn = {
  headers: [string, string][];
  tree: GameTree;
  result: string;
  warnings: string[];
  /** Total games detected in the input (only the first is parsed). */
  gameCount: number;
};

export type PgnParseError = { message: string };

const RESULTS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);

/** Suffix annotation → NAG (PGN §10). */
const SUFFIX_NAG: Record<string, number> = {
  "!": 1,
  "?": 2,
  "!!": 3,
  "??": 4,
  "!?": 5,
  "?!": 6,
};
const NAG_SUFFIX: Record<number, string> = { 1: "!", 2: "?", 3: "!!", 4: "??", 5: "!?", 6: "?!" };

// ── Reading ──────────────────────────────────────────────────────────

type Token =
  | { kind: "move"; san: string; nags: number[] }
  | { kind: "nag"; value: number }
  | { kind: "comment"; text: string }
  | { kind: "open" }
  | { kind: "close" }
  | { kind: "result"; value: string };

/** `[%clk 1:23:45]` → seconds. */
function parseClk(text: string): number | null {
  const m = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Strip `[%…]` command tags, collapse whitespace. */
function cleanComment(text: string): string {
  return text
    .replace(/\[%[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalise a move token that failed strict SAN parsing. */
function repairSan(raw: string): string {
  let san = raw;
  // Zero/lowercase castling → letter O castling.
  san = san.replace(/^0-0-0/, "O-O-O").replace(/^0-0/, "O-O");
  san = san.replace(/^o-o-o/, "O-O-O").replace(/^o-o/, "O-O");
  // "e.p." markers and stray characters PGN writers sometimes emit.
  san = san.replace(/e\.p\.?/i, "");
  return san.trim();
}

function tokenizeMovetext(text: string): { tokens: Token[]; warnings: string[] } {
  const tokens: Token[] = [];
  const warnings: string[] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // Line comment: rest of line.
    if (ch === ";") {
      const end = text.indexOf("\n", i);
      const body = text.slice(i + 1, end === -1 ? n : end).trim();
      if (body) tokens.push({ kind: "comment", text: body });
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (ch === "{") {
      const end = text.indexOf("}", i);
      if (end === -1) {
        warnings.push("Unterminated comment — the rest of the movetext was treated as a comment.");
        tokens.push({ kind: "comment", text: text.slice(i + 1).trim() });
        i = n;
        continue;
      }
      tokens.push({ kind: "comment", text: text.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "open" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "close" });
      i++;
      continue;
    }
    if (ch === "$") {
      let j = i + 1;
      while (j < n && /\d/.test(text[j])) j++;
      const value = Number(text.slice(i + 1, j));
      if (Number.isFinite(value)) tokens.push({ kind: "nag", value });
      i = j;
      continue;
    }

    // Word token: read to the next delimiter.
    let j = i;
    while (j < n && !/[\s(){;]/.test(text[j]) && text[j] !== ")") j++;
    let word = text.slice(i, j);
    i = j;

    if (RESULTS.has(word)) {
      tokens.push({ kind: "result", value: word });
      continue;
    }
    // Strip a glued move number: "12.e4", "3...Nf6", "1." …
    const glued = /^(\d+)\.{0,3}(.*)$/.exec(word);
    if (glued) {
      word = glued[2];
      if (!word) continue; // pure move number token
    }
    // Leading dots left over from "..." separated across whitespace.
    word = word.replace(/^\.+/, "");
    if (!word) continue;

    // Suffix annotations → NAGs.
    const nags: number[] = [];
    const suffix = /([!?]{1,2})$/.exec(word);
    if (suffix && SUFFIX_NAG[suffix[1]] !== undefined) {
      nags.push(SUFFIX_NAG[suffix[1]]);
      word = word.slice(0, -suffix[1].length);
    }
    if (!word) continue;

    tokens.push({ kind: "move", san: word, nags });
  }

  return { tokens, warnings };
}

/** Split raw text into header tag pairs + movetext (first game only). */
function splitSections(text: string): {
  headers: [string, string][];
  movetext: string;
  gameCount: number;
} {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const headers: [string, string][] = [];
  let i = 0;

  // Header section: tag pairs, blank lines, and % escape lines.
  const tagRe = /^\s*\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*/;
  let rest = src;
  while (true) {
    // Skip escape lines (PGN §6) and leading blank lines.
    const escaped = /^\s*%[^\n]*\n/.exec(rest);
    if (escaped) {
      rest = rest.slice(escaped[0].length);
      continue;
    }
    const m = tagRe.exec(rest);
    if (!m) break;
    headers.push([m[1], m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\")]);
    rest = rest.slice(m[0].length);
  }
  i = src.length - rest.length;

  // Movetext runs until the next header block (another game) or EOF.
  // A '[' at line start followed by a tag pair marks the next game —
  // but only when we're outside braces.
  let end = src.length;
  let depth = 0;
  let games = 1;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === "{") depth++;
    else if (c === "}") depth = Math.max(0, depth - 1);
    else if (c === "[" && depth === 0 && (k === 0 || src[k - 1] === "\n")) {
      if (tagRe.test(src.slice(k))) {
        if (end === src.length) end = k;
        games++;
        // Skip past this tag so we count each following game once.
        const stepMatch = tagRe.exec(src.slice(k));
        let k2 = k + (stepMatch ? stepMatch[0].length : 1);
        // Fast-forward to the next game boundary candidate.
        while (
          k2 < src.length &&
          !(src[k2] === "[" && src[k2 - 1] === "\n" && tagRe.test(src.slice(k2)))
        )
          k2++;
        k = k2 - 1;
      }
    }
  }

  return { headers, movetext: src.slice(i, end), gameCount: games };
}

/**
 * Parse PGN text into a GameTree. Never throws for malformed movetext —
 * problems surface in `warnings` and the tree holds the parseable
 * prefix. Throws only when nothing playable can be extracted (e.g. an
 * invalid FEN header, or input that isn't PGN at all).
 */
export function parsePgn(text: string): ParsedPgn {
  if (!text || !text.trim()) throw new Error("The PGN input is empty.");
  const { headers, movetext, gameCount } = splitSections(text);
  const warnings: string[] = [];

  // Custom starting position.
  const fenTag = headers.find(([k]) => k.toLowerCase() === "fen")?.[1];
  const setupTag = headers.find(([k]) => k.toLowerCase() === "setup")?.[1];
  let rootFen: string | undefined;
  if (fenTag && setupTag !== "0") {
    rootFen = fenTag;
  }

  let tree: GameTree;
  try {
    tree = new GameTree(rootFen);
  } catch {
    throw new Error(`The FEN header is not a valid position: "${fenTag}"`);
  }

  // Informational, not a validation failure: the header FEN is honoured
  // exactly as supplied and is used only as the ROOT. Every later position
  // still comes from chess.move() over the movetext, so the active color
  // flips normally from here on. Pushed before the move warnings so the
  // notice reads first, and it never fires for the standard array.
  if (rootFen && isCustomPosition(tree.rootFen)) {
    warnings.push(customPositionNotice(tree.rootFen, "pgn"));
  }

  const { tokens, warnings: tokenWarnings } = tokenizeMovetext(movetext);
  warnings.push(...tokenWarnings);

  let result = "*";
  // Cursor per variation level: the node moves attach to.
  const stack: { cursor: string; lastMove: string | null; skipping: boolean }[] = [
    { cursor: ROOT_ID, lastMove: null, skipping: false },
  ];

  for (const tok of tokens) {
    const level = stack[stack.length - 1];

    if (tok.kind === "open") {
      // A variation branches from the position *before* the last move.
      const from = level.lastMove ? (tree.node(level.lastMove)?.parentId ?? ROOT_ID) : level.cursor;
      stack.push({ cursor: from, lastMove: null, skipping: level.skipping });
      continue;
    }
    if (tok.kind === "close") {
      if (stack.length > 1) stack.pop();
      else warnings.push("Unbalanced ')' in movetext was ignored.");
      continue;
    }
    if (level.skipping) continue;

    if (tok.kind === "result") {
      result = tok.value;
      continue;
    }
    if (tok.kind === "comment") {
      const target = level.lastMove ?? level.cursor;
      const node = tree.node(target);
      if (node) {
        const clk = parseClk(tok.text);
        if (clk !== null && node.clockSeconds === null) tree.setClock(node.id, clk);
        const cleaned = cleanComment(tok.text);
        if (cleaned) {
          tree.setComment(node.id, node.comment ? `${node.comment} ${cleaned}` : cleaned);
        }
      }
      continue;
    }
    if (tok.kind === "nag") {
      if (level.lastMove) tree.toggleNag(level.lastMove, tok.value);
      continue;
    }

    // Move token.
    let node = tree.play(level.cursor, tok.san);
    if (!node) {
      const repaired = repairSan(tok.san);
      if (repaired && repaired !== tok.san) node = tree.play(level.cursor, repaired);
    }
    if (!node) {
      warnings.push(
        `Illegal or unreadable move "${tok.san}" — the rest of ${
          stack.length > 1 ? "this variation" : "the game"
        } was skipped.`,
      );
      level.skipping = true;
      continue;
    }
    for (const nag of tok.nags) tree.toggleNag(node.id, nag);
    level.cursor = node.id;
    level.lastMove = node.id;
  }

  if (tree.size === 0 && headers.length === 0) {
    throw new Error("No moves or headers found — this doesn't look like PGN.");
  }
  if (gameCount > 1) {
    warnings.push(`The input contains ${gameCount} games — the first one was imported.`);
  }

  const headerResult = headers.find(([k]) => k.toLowerCase() === "result")?.[1];
  if (result === "*" && headerResult && RESULTS.has(headerResult)) result = headerResult;

  return { headers, tree, result, warnings, gameCount };
}

// ── Writing ──────────────────────────────────────────────────────────

export type SerializeOptions = {
  /** Include comments and NAG annotations (default true). */
  annotations?: boolean;
  /** Include side variations (default true). */
  variations?: boolean;
  result?: string;
};

const ROSTER = ["Event", "Site", "Date", "Round", "White", "Black", "Result"] as const;

function escapeHeaderValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeComment(text: string): string {
  return text.replace(/\}/g, "]").replace(/\s+/g, " ").trim();
}

function moveNumberPrefix(node: MoveNode, needed: boolean): string | null {
  if (node.color === "w") return `${node.moveNumber}.`;
  return needed ? `${node.moveNumber}...` : null;
}

/**
 * Serialize a game tree to PGN movetext + headers. `headers` may carry
 * any tags; the Seven Tag Roster is always emitted (with "?" defaults)
 * in canonical order, followed by remaining tags alphabetically.
 */
export function serializePgn(
  tree: GameTree,
  headers: [string, string][] = [],
  opts: SerializeOptions = {},
): string {
  const annotations = opts.annotations ?? true;
  const variations = opts.variations ?? true;

  const map = new Map<string, string>();
  for (const [k, v] of headers) map.set(k, v);
  const result = opts.result ?? map.get("Result") ?? "*";
  map.set("Result", result);
  if (tree.rootFen !== START_FEN) {
    map.set("SetUp", "1");
    map.set("FEN", tree.rootFen);
  }

  const lines: string[] = [];
  for (const key of ROSTER) {
    lines.push(`[${key} "${escapeHeaderValue(map.get(key) ?? "?")}"]`);
    map.delete(key);
  }
  for (const key of [...map.keys()].sort()) {
    lines.push(`[${key} "${escapeHeaderValue(map.get(key)!)}"]`);
  }
  lines.push("");

  const tokens: string[] = [];
  const rootComment = tree.root.comment;
  if (annotations && rootComment) tokens.push(`{${escapeComment(rootComment)}}`);

  emitLine(tree, tree.next(ROOT_ID), tokens, true, annotations, variations);
  tokens.push(result);

  // Glue parentheses to their neighbours: "( 1... c5 )" → "(1... c5)".
  const glued: string[] = [];
  for (const tok of tokens) {
    if (tok === ")" && glued.length > 0) {
      glued[glued.length - 1] += ")";
    } else if (glued.length > 0 && glued[glued.length - 1].endsWith("(")) {
      glued[glued.length - 1] += tok;
    } else {
      glued.push(tok);
    }
  }

  // Greedy wrap at 80 columns.
  let line = "";
  for (const tok of glued) {
    if (line.length === 0) {
      line = tok;
    } else if (line.length + 1 + tok.length <= 80) {
      line += ` ${tok}`;
    } else {
      lines.push(line);
      line = tok;
    }
  }
  if (line) lines.push(line);

  return lines.join("\n") + "\n";
}

function emitLine(
  tree: GameTree,
  head: MoveNode | null,
  out: string[],
  numberAtStart: boolean,
  annotations: boolean,
  variations: boolean,
): void {
  let cur = head;
  let needNumber = numberAtStart;

  while (cur) {
    const prefix = moveNumberPrefix(cur, needNumber);
    let moveTok = cur.san;
    if (annotations) {
      const quality = cur.nags.find((x) => x >= 1 && x <= 6);
      if (quality) moveTok += NAG_SUFFIX[quality];
    }
    out.push(prefix ? `${prefix} ${moveTok}` : moveTok);
    needNumber = false;

    if (annotations) {
      for (const nag of cur.nags) {
        if (nag < 1 || nag > 6) out.push(`$${nag}`);
      }
      if (cur.comment) {
        out.push(`{${escapeComment(cur.comment)}}`);
        needNumber = true;
      }
    }

    // Sibling variations attach after the mainline move they replace.
    if (variations && cur.parentId !== null) {
      const parent = tree.node(cur.parentId)!;
      if (parent.children[0] === cur.id && parent.children.length > 1) {
        for (const altId of parent.children.slice(1)) {
          out.push("(");
          emitLine(tree, tree.node(altId), out, true, annotations, variations);
          out.push(")");
        }
        needNumber = true;
      }
    }

    cur = tree.next(cur.id);
  }
}

// ── FEN helpers ──────────────────────────────────────────────────────

/**
 * Whose move it is, read straight from the FEN's active-color field.
 *
 * The FEN is authoritative: this never infers the side from piece
 * placement and never rewrites the field. A FEN that is syntactically and
 * basically legal but retrograde-impossible (a white pawn on g4 with every
 * black piece still at home, say) is accepted as given — chess.js does not
 * check reachability and neither do we, because the positions that would
 * trip such a check are exactly the composed studies and puzzles this
 * board exists to analyse.
 */
export function sideToMoveFromFen(fen: string): "White" | "Black" {
  return fen.trim().split(/\s+/)[1] === "b" ? "Black" : "White";
}

/** True when `fen` is not the standard opening array. */
export function isCustomPosition(fen: string): boolean {
  return fen.trim().replace(/\s+/g, " ") !== START_FEN;
}

/**
 * The informational notice shown when analysis starts from a position the
 * user supplied rather than the standard array.
 *
 * It exists because the engine's suggestions are only surprising when you
 * disagree with it about whose move it is: a loaded position that says
 * White to move produces White arrows, correctly, and without this line
 * there is nothing on screen to say so.
 */
export function customPositionNotice(fen: string, source: "fen" | "pgn"): string {
  const from = source === "pgn" ? " from FEN" : "";
  return `Custom position loaded${from} — ${sideToMoveFromFen(fen)} to move.`;
}

/**
 * Validate a FEN string. Returns the normalised FEN chess.js would emit
 * or a human-readable error. Accepts 4-field FENs (EPD style) by
 * defaulting the clocks.
 */
export function validateFen(fen: string): { ok: true; fen: string } | { ok: false; error: string } {
  const trimmed = fen.trim().replace(/\s+/g, " ");
  if (!trimmed) return { ok: false, error: "The FEN input is empty." };

  const fields = trimmed.split(" ");
  let candidate = trimmed;
  if (fields.length === 4) candidate = `${trimmed} 0 1`;
  else if (fields.length === 5) candidate = `${trimmed} 1`;
  else if (fields.length !== 6) {
    return {
      ok: false,
      error: `A FEN has 6 space-separated fields — got ${fields.length}.`,
    };
  }

  try {
    const chess = new Chess(candidate);
    return { ok: true, fen: chess.fen() };
  } catch (e) {
    const msg = e instanceof Error ? e.message.replace(/^Invalid FEN: /, "") : "invalid position";
    return { ok: false, error: `Not a legal position: ${msg}` };
  }
}
