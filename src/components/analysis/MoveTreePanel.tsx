// =====================================================================
// MoveTreePanel — the annotated move list with nested variations
// ---------------------------------------------------------------------
// Renders the game tree the way a study reads: mainline moves in rows,
// variations inline in parentheses (indented one level per depth),
// comments in italics, NAG glyphs after the SAN, review badges when a
// review has run. Clicking any move jumps there; the toolbar under the
// list edits the current move (annotate / comment / promote / delete /
// bookmark).
// =====================================================================
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpToLine, Bookmark, MessageSquareText, Trash2 } from "lucide-react";

import type { AnalyzedMove } from "@/lib/analysis/types";
import { CLASS_COLOR, CLASS_ICON, CLASS_LABEL } from "@/lib/chess/classification";
import { NAG_GLYPH, ROOT_ID, type MoveNode } from "@/lib/chess/moveTree";

import type { AnalysisSession } from "./useAnalysisSession";

const QUALITY_NAGS = [1, 2, 3, 4, 5, 6];

type MoveButtonProps = {
  node: MoveNode;
  isCurrent: boolean;
  isBookmarked: boolean;
  analysis: AnalyzedMove | null;
  showNumber: boolean;
  onClick: () => void;
};

const MoveButton = memo(function MoveButton({
  node,
  isCurrent,
  isBookmarked,
  analysis,
  showNumber,
  onClick,
}: MoveButtonProps) {
  const numberText =
    node.color === "w" ? `${node.moveNumber}.` : showNumber ? `${node.moveNumber}…` : null;
  const glyphs = node.nags.map((n) => NAG_GLYPH[n] ?? `$${n}`).join("");
  return (
    <button
      type="button"
      onClick={onClick}
      data-current={isCurrent || undefined}
      className={`inline-flex items-baseline gap-0.5 rounded px-1 py-0.5 font-mono text-[13px] leading-5 transition-colors ${
        isCurrent ? "bg-gold/20 text-gold" : "hover:bg-white/5"
      }`}
      aria-current={isCurrent ? "step" : undefined}
    >
      {numberText && <span className="text-muted-foreground/70">{numberText}</span>}
      <span>
        {node.san}
        {glyphs && <span className="text-gold/90">{glyphs}</span>}
      </span>
      {analysis && (
        <span
          className={`text-[10px] font-bold ${CLASS_COLOR[analysis.classification]}`}
          title={CLASS_LABEL[analysis.classification]}
        >
          {CLASS_ICON[analysis.classification]}
        </span>
      )}
      {isBookmarked && (
        <Bookmark className="h-2.5 w-2.5 fill-gold text-gold" aria-label="Bookmarked" />
      )}
    </button>
  );
});

/**
 * Recursive line renderer. `head` is the first move of a line; sibling
 * variations of each mainline move render as indented sub-blocks right
 * after it.
 */
function Line({
  session,
  head,
  depth,
  numberFirst,
}: {
  session: AnalysisSession;
  head: MoveNode | null;
  depth: number;
  numberFirst: boolean;
}) {
  const { tree } = session;
  const parts: React.ReactNode[] = [];
  let cur = head;
  let needNumber = numberFirst;

  while (cur) {
    const node = cur;
    parts.push(
      <MoveButton
        key={node.id}
        node={node}
        isCurrent={session.currentId === node.id}
        isBookmarked={session.bookmarks.has(node.id)}
        analysis={depth === 0 ? session.analysisFor(node) : null}
        showNumber={needNumber}
        onClick={() => session.goTo(node.id)}
      />,
    );
    needNumber = false;

    if (node.comment) {
      parts.push(
        <span key={`${node.id}-c`} className="mx-0.5 text-xs italic text-muted-foreground/90">
          {node.comment}
        </span>,
      );
      needNumber = true;
    }

    const parent = node.parentId ? tree.node(node.parentId) : null;
    if (parent && parent.children[0] === node.id && parent.children.length > 1) {
      for (const altId of parent.children.slice(1)) {
        const alt = tree.node(altId);
        if (!alt) continue;
        parts.push(
          <span
            key={`${altId}-v`}
            className="my-0.5 block rounded border-l-2 border-gold/20 bg-white/[0.015] py-0.5 pl-2 text-muted-foreground"
            style={{ marginLeft: Math.min(depth + 1, 4) * 8 }}
          >
            <Line session={session} head={alt} depth={depth + 1} numberFirst />
          </span>,
        );
      }
      needNumber = true;
    }

    cur = tree.next(node.id);
  }

  return <>{parts}</>;
}

export function MoveTreePanel({ session }: { session: AnalysisSession }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [commentDraft, setCommentDraft] = useState<string | null>(null);

  const { currentNode } = session;
  const editable = currentNode.parentId !== null;

  // Keep the current move in view while navigating.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[data-current]");
    el?.scrollIntoView({ block: "nearest" });
  }, [session.currentId]);

  // Reset the comment draft when the cursor moves.
  useEffect(() => setCommentDraft(null), [session.currentId]);

  const bookmarkedNodes = useMemo(
    () =>
      [...session.bookmarks]
        .map((id) => session.tree.node(id))
        .filter((n): n is MoveNode => n !== null)
        .sort((a, b) => a.ply - b.ply),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.bookmarks, session.version],
  );

  const firstMove = session.tree.next(ROOT_ID);

  return (
    <section aria-label="Move list" className="flex min-h-0 flex-col">
      {bookmarkedNodes.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1 text-[11px]">
          <span className="text-muted-foreground">Bookmarks:</span>
          {bookmarkedNodes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => session.goTo(n.id)}
              className="rounded-full border border-gold/25 bg-gold/5 px-2 py-0.5 font-mono text-gold hover:bg-gold/15"
            >
              {n.moveNumber}
              {n.color === "w" ? "." : "…"} {n.san}
            </button>
          ))}
        </div>
      )}

      <div
        ref={listRef}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/5 bg-white/[0.02] p-2 leading-6"
        tabIndex={0}
        aria-label="Game moves — use arrow keys to navigate"
      >
        {firstMove ? (
          <Line session={session} head={firstMove} depth={0} numberFirst />
        ) : (
          <p className="p-2 text-xs text-muted-foreground">
            No moves yet — play on the board, or import a PGN or FEN to begin.
          </p>
        )}
      </div>

      {/* Current-move toolbar */}
      {editable && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 font-mono text-xs text-gold">
              {currentNode.moveNumber}
              {currentNode.color === "w" ? "." : "…"} {currentNode.san}
            </span>
            {QUALITY_NAGS.map((nag) => (
              <button
                key={nag}
                type="button"
                onClick={() => session.toggleNag(currentNode.id, nag)}
                aria-pressed={currentNode.nags.includes(nag)}
                className={`rounded px-1.5 py-0.5 font-mono text-xs transition-colors ${
                  currentNode.nags.includes(nag)
                    ? "bg-gold/25 text-gold"
                    : "bg-white/5 text-muted-foreground hover:text-foreground"
                }`}
                title={`Annotate ${NAG_GLYPH[nag]}`}
              >
                {NAG_GLYPH[nag]}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-white/10" />
            <button
              type="button"
              onClick={() => session.toggleBookmark(currentNode.id)}
              aria-pressed={session.bookmarks.has(currentNode.id)}
              className={`rounded p-1 transition-colors ${
                session.bookmarks.has(currentNode.id)
                  ? "text-gold"
                  : "text-muted-foreground hover:text-gold"
              }`}
              title="Bookmark this move"
            >
              <Bookmark
                className={`h-3.5 w-3.5 ${session.bookmarks.has(currentNode.id) ? "fill-gold" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={() =>
                setCommentDraft((d) => (d === null ? (currentNode.comment ?? "") : null))
              }
              className="rounded p-1 text-muted-foreground transition-colors hover:text-gold"
              title="Comment on this move"
            >
              <MessageSquareText className="h-3.5 w-3.5" />
            </button>
            {!session.tree.isMainline(currentNode.id) && (
              <button
                type="button"
                onClick={() => session.promoteVariation(currentNode.id)}
                className="rounded p-1 text-muted-foreground transition-colors hover:text-gold"
                title="Promote this variation to the mainline"
              >
                <ArrowUpToLine className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => session.deleteFrom(currentNode.id)}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-red-400"
              title="Delete this move and everything after it"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {commentDraft !== null && (
            <div className="flex gap-2">
              <input
                type="text"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    session.setComment(currentNode.id, commentDraft);
                    setCommentDraft(null);
                  } else if (e.key === "Escape") {
                    setCommentDraft(null);
                  }
                }}
                placeholder="Add a comment… (Enter to save)"
                className="min-w-0 flex-1 rounded-md border border-gold/20 bg-white/[0.02] px-2 py-1 text-xs outline-none focus:border-gold/50"
                autoFocus
                maxLength={2000}
              />
              <button
                type="button"
                onClick={() => {
                  session.setComment(currentNode.id, commentDraft);
                  setCommentDraft(null);
                }}
                className="rounded-md bg-gold/20 px-2.5 py-1 text-xs text-gold hover:bg-gold/30"
              >
                Save
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
