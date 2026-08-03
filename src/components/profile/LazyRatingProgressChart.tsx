// Viewport-gated loader for the rating chart.
//
// Server and first client render both produce the placeholder, so there is
// no hydration mismatch — this deliberately avoids React.lazy/Suspense,
// which this SSR'd app has no established pattern for. The recharts chunk
// is fetched only once the card is near the viewport, so a visitor who
// never scrolls past the stats grid never downloads it at all.
import { useEffect, useRef, useState, type ComponentType } from "react";
import type { RatingPoint } from "./RatingProgressChart";

type ChartComponent = ComponentType<{ data: RatingPoint[] }>;

export function LazyRatingProgressChart({ data }: { data: RatingPoint[] }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [Chart, setChart] = useState<ChartComponent | null>(null);

  useEffect(() => {
    if (Chart) return;
    const el = holderRef.current;
    if (!el) return;

    let cancelled = false;
    const load = () => {
      import("./RatingProgressChart")
        .then((m) => {
          if (!cancelled) setChart(() => m.default);
        })
        .catch(() => {
          /* offline or chunk 404 — the placeholder stays, page keeps working */
        });
    };

    if (typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        cancelled = true;
      };
    }

    // Start fetching a little before the card scrolls in so the chart is
    // usually painted by the time it is actually on screen.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [Chart]);

  return (
    <div ref={holderRef} className="h-full w-full">
      {Chart ? (
        <Chart data={data} />
      ) : (
        <div className="h-full w-full animate-pulse rounded-lg bg-white/[0.03]" />
      )}
    </div>
  );
}
