// Viewport-gated wrappers for the three board viewers in PgnViewer.tsx.
//
// PostCard is imported by five separate route chunks, so Rollup hoisted it
// into the client ENTRY chunk — and PostCard -> PgnViewer -> chess.js was
// the only path dragging the 35 KB chess engine onto every page, including
// the landing page, which has no board on it at all.
//
// All three viewers need chess.js (PgnViewer constructs `new Chess()`, and
// all of them reach it through lib/chess/validation), so the chain can only
// be cut by loading the module on demand. Post text still server-renders;
// only the interactive board widget arrives a moment later, and it is on a
// minority of posts.
//
// Server and first client render both emit the placeholder, so there is no
// hydration mismatch — same approach as LazyRatingProgressChart.
import { useEffect, useRef, useState, type ComponentType } from "react";

type ViewerModule = typeof import("./PgnViewer");
type ViewerName = "PgnViewer" | "FenViewer" | "PuzzleViewer";

/** Shared module promise so a feed with many boards imports the chunk once. */
let modPromise: Promise<ViewerModule> | null = null;
function loadViewers(): Promise<ViewerModule> {
  if (!modPromise) modPromise = import("./PgnViewer");
  return modPromise;
}

function useLazyViewer(name: ViewerName) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [Comp, setComp] = useState<ComponentType<Record<string, unknown>> | null>(null);

  useEffect(() => {
    if (Comp) return;
    const el = holderRef.current;
    if (!el) return;

    let cancelled = false;
    const load = () => {
      loadViewers()
        .then((m) => {
          if (!cancelled) setComp(() => m[name] as ComponentType<Record<string, unknown>>);
        })
        .catch(() => {
          /* chunk unavailable — placeholder stays, the rest of the post works */
        });
    };

    if (typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        cancelled = true;
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [Comp, name]);

  return { holderRef, Comp };
}

function Placeholder() {
  return (
    <div className="h-[260px] w-full animate-pulse rounded-xl border border-white/10 bg-white/[0.02]" />
  );
}

export function PgnViewer(props: { pgn: string }) {
  const { holderRef, Comp } = useLazyViewer("PgnViewer");
  return <div ref={holderRef}>{Comp ? <Comp {...props} /> : <Placeholder />}</div>;
}

export function FenViewer(props: { fen: string }) {
  const { holderRef, Comp } = useLazyViewer("FenViewer");
  return <div ref={holderRef}>{Comp ? <Comp {...props} /> : <Placeholder />}</div>;
}

export function PuzzleViewer(props: { fen: string; solution: string | null }) {
  const { holderRef, Comp } = useLazyViewer("PuzzleViewer");
  return <div ref={holderRef}>{Comp ? <Comp {...props} /> : <Placeholder />}</div>;
}
