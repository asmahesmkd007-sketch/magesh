// =====================================================================
// useAnalysisSession — the analysis room's state backbone
// ---------------------------------------------------------------------
// Owns the game tree (moves, variations, comments, NAGs), the cursor,
// bookmarks, PGN headers, and the engine review lifecycle. The tree is
// a mutable structure (see moveTree.ts); this hook bumps a version
// counter after each mutation, and every derived value memoises on
// [version, currentId] so navigation stays O(path length).
// =====================================================================
import { useCallback, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";

import { analyzeGame, REVIEW_DEPTH_DEFAULT } from "@/lib/analysis/gameAnalyzer";
import { buildGameReview } from "@/lib/analysis/review";
import type { AnalyzedMove, GameReview, ReviewProgress } from "@/lib/analysis/types";
import { GameTree, ROOT_ID, START_FEN, type MoveNode, type TreeMove } from "@/lib/chess/moveTree";
import { detectOpening, type OpeningMatch } from "@/lib/chess/openings";
import { parsePgn, serializePgn, validateFen, type SerializeOptions } from "@/lib/chess/pgn";
import { logger } from "@/lib/logger";

export type ReviewState =
  | { status: "idle" }
  | { status: "running"; progress: ReviewProgress }
  | { status: "done"; review: GameReview; byPly: Map<number, AnalyzedMove> }
  | { status: "error"; message: string };

export type ImportResult = { ok: true; warnings: string[] } | { ok: false; error: string };

export type AnalysisSession = ReturnType<typeof useAnalysisSession>;

export function useAnalysisSession() {
  const treeRef = useRef<GameTree>(new GameTree());
  const [version, setVersion] = useState(0);
  const [currentId, setCurrentId] = useState<string>(ROOT_ID);
  const [headers, setHeaders] = useState<[string, string][]>([]);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [reviewState, setReviewState] = useState<ReviewState>({ status: "idle" });
  const reviewAbortRef = useRef<AbortController | null>(null);

  const tree = treeRef.current;
  const bump = useCallback(() => setVersion(treeRef.current.version), []);

  // ── Derived position state ─────────────────────────────────────────
  const currentNode = tree.node(currentId) ?? tree.root;
  const fen = currentNode.fenAfter;

  const position = useMemo(() => new Chess(fen), [fen]);

  const mainline = useMemo(
    () => tree.mainline(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, version],
  );

  const pathToCurrent = useMemo(
    () => tree.path(currentId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, currentId, version],
  );

  const mainlineSans = useMemo(() => mainline.map((n) => n.san), [mainline]);
  const opening: OpeningMatch | null = useMemo(() => detectOpening(mainlineSans), [mainlineSans]);

  const lastMove = useMemo(() => {
    if (currentNode.parentId === null) return null;
    return { from: currentNode.uci.slice(0, 2), to: currentNode.uci.slice(2, 4) };
  }, [currentNode]);

  const checkSquare = useMemo(() => {
    if (!position.inCheck()) return null;
    const turn = position.turn();
    for (const row of position.board())
      for (const cell of row)
        if (cell && cell.type === "k" && cell.color === turn) return cell.square;
    return null;
  }, [position]);

  // ── Navigation ─────────────────────────────────────────────────────
  const goTo = useCallback((id: string) => {
    if (treeRef.current.node(id)) setCurrentId(id);
  }, []);

  const goNext = useCallback(() => {
    setCurrentId((id) => treeRef.current.next(id)?.id ?? id);
  }, []);

  const goPrev = useCallback(() => {
    setCurrentId((id) => treeRef.current.prev(id)?.id ?? ROOT_ID);
  }, []);

  const goStart = useCallback(() => setCurrentId(ROOT_ID), []);

  const goEnd = useCallback(() => {
    setCurrentId((id) => treeRef.current.endOfLine(id).id);
  }, []);

  /** Jump to the mainline node at a given ply (chart / slider seeks). */
  const goToPly = useCallback(
    (ply: number) => {
      if (ply <= 0) {
        setCurrentId(ROOT_ID);
        return;
      }
      const target = mainline[ply - 1];
      if (target) setCurrentId(target.id);
    },
    [mainline],
  );

  /** Next sibling variation at the current branching point (cycling). */
  const goToVariation = useCallback((direction: 1 | -1) => {
    setCurrentId((id) => {
      const t = treeRef.current;
      const node = t.node(id);
      if (!node || node.parentId === null) return id;
      const parent = t.node(node.parentId)!;
      if (parent.children.length < 2) return id;
      const idx = parent.children.indexOf(id);
      const next = (idx + direction + parent.children.length) % parent.children.length;
      return parent.children[next];
    });
  }, []);

  // ── Editing ────────────────────────────────────────────────────────
  const playMove = useCallback(
    (move: TreeMove | string): MoveNode | null => {
      const node = treeRef.current.play(currentId, move);
      if (node) {
        setCurrentId(node.id);
        bump();
      }
      return node;
    },
    [currentId, bump],
  );

  const promoteVariation = useCallback(
    (id: string) => {
      treeRef.current.promote(id);
      bump();
    },
    [bump],
  );

  const deleteFrom = useCallback(
    (id: string) => {
      const t = treeRef.current;
      const parent = t.prev(id);
      const path = new Set(t.path(currentId).map((n) => n.id));
      t.delete(id);
      // If the cursor was inside the deleted subtree, retreat to the cut.
      if (path.has(id) || !t.node(currentId)) setCurrentId(parent?.id ?? ROOT_ID);
      setBookmarks((prev) => {
        const next = new Set([...prev].filter((b) => t.node(b)));
        return next.size === prev.size ? prev : next;
      });
      bump();
    },
    [currentId, bump],
  );

  const setComment = useCallback(
    (id: string, comment: string | null) => {
      treeRef.current.setComment(id, comment);
      bump();
    },
    [bump],
  );

  const toggleNag = useCallback(
    (id: string, nag: number) => {
      treeRef.current.toggleNag(id, nag);
      bump();
    },
    [bump],
  );

  const toggleBookmark = useCallback((id: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Import / export / reset ────────────────────────────────────────
  const cancelReview = useCallback(() => {
    reviewAbortRef.current?.abort();
    reviewAbortRef.current = null;
    setReviewState((s) => (s.status === "running" ? { status: "idle" } : s));
  }, []);

  const replaceTree = useCallback(
    (next: GameTree, nextHeaders: [string, string][], cursor?: string) => {
      cancelReview();
      treeRef.current = next;
      setHeaders(nextHeaders);
      setBookmarks(new Set());
      setReviewState({ status: "idle" });
      setCurrentId(cursor ?? next.endOfLine(ROOT_ID).id);
      setVersion(next.version);
    },
    [cancelReview],
  );

  const importPgn = useCallback(
    (text: string): ImportResult => {
      try {
        const parsed = parsePgn(text);
        replaceTree(parsed.tree, parsed.headers);
        return { ok: true, warnings: parsed.warnings };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Could not parse this PGN." };
      }
    },
    [replaceTree],
  );

  const importFen = useCallback(
    (text: string): ImportResult => {
      const v = validateFen(text);
      if (!v.ok) return { ok: false, error: v.error };
      try {
        replaceTree(new GameTree(v.fen), []);
        return { ok: true, warnings: [] };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Invalid position." };
      }
    },
    [replaceTree],
  );

  const reset = useCallback(() => {
    replaceTree(new GameTree(), [], ROOT_ID);
  }, [replaceTree]);

  const exportPgn = useCallback(
    (opts?: SerializeOptions): string => serializePgn(treeRef.current, headers, opts),
    [headers],
  );

  // ── Engine review ──────────────────────────────────────────────────
  const runReview = useCallback(
    async (depth: number = REVIEW_DEPTH_DEFAULT) => {
      const line = treeRef.current.mainline();
      if (line.length === 0) {
        setReviewState({ status: "error", message: "Play or import some moves first." });
        return;
      }
      cancelReview();
      const abort = new AbortController();
      reviewAbortRef.current = abort;
      setReviewState({
        status: "running",
        progress: { done: 0, total: line.length + 1, lastMove: null },
      });

      const op = detectOpening(line.map((n) => n.san));
      const inputs = line.map((n) => ({
        ply: n.ply,
        san: n.san,
        uci: n.uci,
        color: n.color,
        fenBefore: treeRef.current.node(n.parentId!)!.fenAfter,
        fenAfter: n.fenAfter,
      }));

      try {
        const moves = await analyzeGame(inputs, {
          depth,
          bookPlies: op?.plies ?? 0,
          signal: abort.signal,
          onProgress: (progress) => setReviewState({ status: "running", progress }),
        });
        const review = buildGameReview(moves, {
          bookPlies: op?.plies ?? 0,
          openingName: op?.name ?? null,
          openingEco: op?.eco ?? null,
          depth,
        });
        setReviewState({
          status: "done",
          review,
          byPly: new Map(moves.map((m) => [m.ply, m])),
        });
      } catch (e) {
        if (e instanceof Error && e.message === "aborted") return;
        logger.error("game review failed", { error: e });
        setReviewState({
          status: "error",
          message:
            e instanceof Error && e.message
              ? `Review failed: ${e.message}`
              : "The engine could not finish the review. Please try again.",
        });
      } finally {
        if (reviewAbortRef.current === abort) reviewAbortRef.current = null;
      }
    },
    [cancelReview],
  );

  /** Review annotation for a mainline node, when a review exists. */
  const analysisFor = useCallback(
    (node: MoveNode): AnalyzedMove | null => {
      if (reviewState.status !== "done") return null;
      const a = reviewState.byPly.get(node.ply);
      // Only badge the node the review actually looked at (mainline may
      // have been edited since).
      return a && a.san === node.san && a.fenAfter === node.fenAfter ? a : null;
    },
    [reviewState],
  );

  return {
    // tree + cursor
    tree,
    version,
    currentId,
    currentNode,
    fen,
    position,
    mainline,
    pathToCurrent,
    headers,
    setHeaders,
    opening,
    lastMove,
    checkSquare,
    bookmarks,
    // navigation
    goTo,
    goNext,
    goPrev,
    goStart,
    goEnd,
    goToPly,
    goToVariation,
    // editing
    playMove,
    promoteVariation,
    deleteFrom,
    setComment,
    toggleNag,
    toggleBookmark,
    // io
    importPgn,
    importFen,
    exportPgn,
    reset,
    // review
    reviewState,
    runReview,
    cancelReview,
    analysisFor,
  };
}
