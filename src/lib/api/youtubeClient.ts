// =====================================================================
// YOUTUBE TOPIC VIDEO — SERVER FUNCTION
// ---------------------------------------------------------------------
// Searches YouTube Data API v3 for the most relevant video matching a
// given query. Called from the YouTubeTopicVideo component via React
// Query. The API key is read from process.env.YOUTUBE_API_KEY and
// never exposed to the browser.
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type YouTubeVideoResult = {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  duration: string | null;
  viewCount: string | null;
  publishedAt: string | null;
};

export const searchYouTubeVideo = createServerFn({ method: "GET" })
  .inputValidator(z.object({ query: z.string().min(1).max(300) }))
  .handler(async ({ data }): Promise<YouTubeVideoResult | null> => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return null;

    try {
      // Step 1: Search for the most relevant video
      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("q", data.query);
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("maxResults", "1");
      searchUrl.searchParams.set("relevanceLanguage", "en");
      searchUrl.searchParams.set("safeSearch", "strict");
      searchUrl.searchParams.set("videoCategoryId", "27"); // Education category
      searchUrl.searchParams.set("key", apiKey);

      const searchRes = await fetch(searchUrl.toString());
      if (!searchRes.ok) return null;

      const searchData = (await searchRes.json()) as {
        items?: Array<{
          id?: { videoId?: string };
          snippet?: {
            title?: string;
            channelTitle?: string;
            publishedAt?: string;
            thumbnails?: {
              high?: { url?: string };
              medium?: { url?: string };
              default?: { url?: string };
            };
          };
        }>;
      };

      const item = searchData.items?.[0];
      if (!item) return null;

      const videoId = item.id?.videoId;
      if (!videoId) return null;

      const snippet = item.snippet ?? {};
      const thumbnailUrl =
        snippet.thumbnails?.high?.url ??
        snippet.thumbnails?.medium?.url ??
        snippet.thumbnails?.default?.url ??
        `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

      // Step 2: Fetch duration + view count via the videos endpoint
      const detailUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      detailUrl.searchParams.set("part", "contentDetails,statistics");
      detailUrl.searchParams.set("id", videoId);
      detailUrl.searchParams.set("key", apiKey);

      let duration: string | null = null;
      let viewCount: string | null = null;

      const detailRes = await fetch(detailUrl.toString());
      if (detailRes.ok) {
        const detailData = (await detailRes.json()) as {
          items?: Array<{
            contentDetails?: { duration?: string };
            statistics?: { viewCount?: string };
          }>;
        };
        const detail = detailData.items?.[0];
        if (detail) {
          duration = parseDuration(detail.contentDetails?.duration ?? null);
          viewCount = formatViewCount(detail.statistics?.viewCount ?? null);
        }
      }

      return {
        videoId,
        title: snippet.title ?? "Chess Tutorial",
        channelName: snippet.channelTitle ?? "YouTube",
        thumbnailUrl,
        duration,
        viewCount,
        publishedAt: snippet.publishedAt ?? null,
      };
    } catch {
      return null;
    }
  });

// ISO 8601 duration → human-readable (e.g. "PT4M33S" → "4:33")
function parseDuration(iso: string | null): string | null {
  if (!iso) return null;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const h = parseInt(match[1] ?? "0");
  const m = parseInt(match[2] ?? "0");
  const s = parseInt(match[3] ?? "0");
  if (h === 0 && m === 0 && s === 0) return null; // avoid showing "0:00"
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Raw count string → readable label (e.g. "1234567" → "1.2M views")
function formatViewCount(count: string | null): string | null {
  if (!count) return null;
  const n = parseInt(count, 10);
  if (isNaN(n)) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K views`;
  return `${n} views`;
}
