// =====================================================================
// YouTubeTopicVideo — Reusable dynamic YouTube video card
// ---------------------------------------------------------------------
// Accepts `topic`, `keywords`, and `category`, builds a search query,
// calls the server-side YouTube API (key never exposed to browser),
// caches the result for 24 h via React Query, and renders a fully
// interactive video card in the ChessOX theme.
//
// Usage:
//   <YouTubeTopicVideo
//     topic="How To Setup The Chessboard"
//     keywords={["chess tutorial", "beginners"]}
//     category="chess"
//   />
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Play, Youtube } from "lucide-react";
import { searchYouTubeVideo } from "@/lib/api/youtubeClient";

export interface YouTubeTopicVideoProps {
  topic: string;
  keywords?: string[];
  category?: string;
}

function buildQuery(topic: string, keywords?: string[], category?: string): string {
  const parts: string[] = [topic];
  if (keywords?.length) parts.push(...keywords.slice(0, 3));
  if (category) parts.push(category);
  return parts.join(" ");
}

function LoadingSkeleton() {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-gold/15 bg-black/20 animate-pulse">
      <div className="aspect-video bg-white/[0.04]" />
      <div className="p-4 flex items-start gap-3">
        <div className="h-9 w-9 rounded-full bg-white/[0.06] shrink-0" />
        <div className="flex-1 space-y-2 py-1">
          <div className="h-4 bg-white/[0.06] rounded w-4/5" />
          <div className="h-3 bg-white/[0.04] rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function YouTubeTopicVideo({ topic, keywords, category }: YouTubeTopicVideoProps) {
  const query = buildQuery(topic, keywords, category);
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Only trigger the API call once the card scrolls into the viewport,
  // preventing all 9 instances from firing simultaneously on page load.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["youtube-topic-video", query],
    queryFn: () => searchYouTubeVideo({ data: { query } }),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
    enabled: visible, // only fetch when scrolled into view
  });

  // Sentinel div always present so the IntersectionObserver has a stable element.
  // Inner content renders only after the element scrolls into view.
  if (!visible || isLoading) {
    return (
      <div ref={rootRef}>
        <LoadingSkeleton />
      </div>
    );
  }

  if (isError || !data?.videoId) {
    return (
      <div className="mt-3 flex items-center justify-center rounded-xl border border-gold/10 bg-black/10 py-5 text-xs text-muted-foreground/50">
        No video available currently
      </div>
    );
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${data.videoId}`;

  return (
    <a
      href={youtubeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group mt-3 block overflow-hidden rounded-xl border border-gold/15 bg-black/30 transition-all duration-200 hover:border-gold/35 hover:shadow-[0_0_20px_rgba(212,175,55,0.12)]"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden bg-black">
        <img
          src={data.thumbnailUrl}
          alt={data.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
          onError={(e) => {
            const img = e.currentTarget;
            // Only attempt one fallback to avoid infinite error loop
            if (img.dataset.fallback) return;
            img.dataset.fallback = "1";
            img.src = `https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`;
          }}
        />

        {/* Overlay */}
        <div className="absolute inset-0 bg-black/30 transition-opacity duration-200 group-hover:bg-black/15" />

        {/* Play button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 shadow-xl transition-transform duration-200 group-hover:scale-110">
            <Play className="h-6 w-6 fill-white text-white ml-0.5" />
          </div>
        </div>

        {/* Duration badge */}
        {data.duration && (
          <div className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {data.duration}
          </div>
        )}

        {/* YouTube pill top-left */}
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
          <Youtube className="h-3 w-3 text-red-500" />
          YouTube
        </div>
      </div>

      {/* Video info */}
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-600/30 bg-red-600/10">
          <Youtube className="h-4 w-4 text-red-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium text-foreground transition-colors group-hover:text-gold">
            {data.title}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-medium">{data.channelName}</span>
            {data.viewCount && (
              <>
                <span className="text-gold/30">·</span>
                <span>{data.viewCount}</span>
              </>
            )}
          </div>
        </div>
        {/* External link hint */}
        <div className="ml-auto shrink-0 rounded-lg border border-gold/15 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-wider text-gold/50 transition-colors group-hover:border-gold/30 group-hover:text-gold/80">
          Watch
        </div>
      </div>
    </a>
  );
}
