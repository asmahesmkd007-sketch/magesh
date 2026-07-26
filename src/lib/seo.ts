// =====================================================================
// SEO / AEO / GEO helpers
// ---------------------------------------------------------------------
// One place for page metadata (title, description, keywords, canonical,
// Open Graph, Twitter/X cards) and JSON-LD structured data.
//
// Route files call `seo()` from their `head()` option. TanStack Router
// merges `meta` from every matched route and the *deepest* match wins for
// a given `name`/`property`, so a child page overrides the defaults set in
// `__root.tsx`. `script:ld+json` entries are never deduped, so the root's
// Organization/WebSite graph and a page's own schema both render.
//
// Nothing in this file renders UI — it only produces <head> tags.
// =====================================================================
import ogImageUrl from "@/assets/hero-regal.jpg";

/** Canonical origin. Every canonical/OG URL is built from this. */
export const SITE_URL = "https://www.chessox.com";
export const SITE_NAME = "ChessOx";
export const TWITTER_HANDLE = "@chessoxcom";
export const CONTACT_EMAIL = "contact@chessox.com";
export const DEFAULT_OG_IMAGE = ogImageUrl;

/** Public profiles used for the Organization `sameAs` graph. */
export const SOCIAL_PROFILES = [
  "https://facebook.com/chessoxcom",
  "https://instagram.com/chessoxcom",
  "https://x.com/chessoxcom",
  "https://discord.gg/Ntm6STVCA6",
  "https://youtube.com/@chessoxcom",
];

/**
 * Plain-language description of the platform, reused by the Organization,
 * WebSite and WebApplication entities. Keep it factual — it is what answer
 * engines quote when asked "what is ChessOx?".
 */
export const SITE_DESCRIPTION =
  "ChessOx is a free online chess platform where you can play chess online against players worldwide, play chess with friends, solve chess puzzles, learn chess from beginner to advanced level, join online chess tournaments and climb global chess rankings.";

const ROBOTS_INDEX = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
const ROBOTS_NOINDEX = "noindex, nofollow";

export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

/** Turn a site-relative path into an absolute URL (already-absolute URLs pass through). */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

type JsonLd = Record<string, unknown>;
type MetaEntry = Record<string, unknown>;
type LinkEntry = Record<string, string>;

export type SeoInput = {
  /** Full <title>. Unique per page. */
  title: string;
  /** Meta description — one or two natural sentences, ~150–160 chars. */
  description: string;
  /** A short, relevant keyword set (kept small on purpose — no stuffing). */
  keywords?: string[];
  /** Canonical path, e.g. "/puzzles". Omit for pages that shouldn't be canonicalised. */
  path?: string;
  /** Absolute or site-relative social share image. */
  image?: string;
  /** Alt text for the share image. Defaults to the page title. */
  imageAlt?: string;
  /** Open Graph object type. "news.article" is used for published reporting. */
  type?: "website" | "article" | "profile" | "news.article";
  /** Private/personal pages: keep them out of search results. */
  noindex?: boolean;
  /** Explicit robots directive, e.g. "noindex, follow". Wins over `noindex`. */
  robots?: string;
  /** One or more JSON-LD objects describing this page. */
  jsonLd?: JsonLd | JsonLd[];
};

/**
 * Build the `meta`/`links` head payload for a page.
 * Returns exactly the shape TanStack Router's `head()` expects.
 */
export function seo(input: SeoInput): { meta: MetaEntry[]; links: LinkEntry[] } {
  const {
    title,
    description,
    keywords,
    path,
    image = DEFAULT_OG_IMAGE,
    imageAlt,
    type = "website",
    noindex = false,
    robots,
    jsonLd,
  } = input;

  const url = path ? absoluteUrl(path) : undefined;
  const imageUrl = absoluteUrl(image);
  const robotsContent = robots ?? (noindex ? ROBOTS_NOINDEX : ROBOTS_INDEX);
  const indexable = !robotsContent.includes("noindex");

  const meta: MetaEntry[] = [
    { title },
    { name: "description", content: description },
    { name: "robots", content: robotsContent },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "en_IN" },
    { property: "og:image", content: imageUrl },
    { property: "og:image:alt", content: imageAlt ?? title },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: imageUrl },
    { name: "twitter:site", content: TWITTER_HANDLE },
    { name: "twitter:creator", content: TWITTER_HANDLE },
  ];

  if (keywords?.length) {
    meta.push({ name: "keywords", content: keywords.join(", ") });
  }
  if (url) {
    meta.push({ property: "og:url", content: url });
  }
  for (const entry of jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : []) {
    meta.push({ "script:ld+json": entry });
  }

  // A canonical on a noindex page sends mixed signals — only emit it for
  // pages we actually want indexed.
  const links: LinkEntry[] = url && indexable ? [{ rel: "canonical", href: url }] : [];

  return { meta, links };
}

/**
 * Shorthand for personal/transactional screens that must stay out of the index.
 * Defaults to "noindex, follow" so crawlers still discover the public pages
 * these screens link to; pass "noindex, nofollow" for fully private areas.
 */
export function noindexSeo(title: string, description: string, robots = "noindex, follow") {
  return seo({ title, description, robots });
}

// =====================================================================
// JSON-LD builders
// ---------------------------------------------------------------------
// Every value below is verifiable from the product itself. No ratings,
// review counts, awards or usage statistics are invented.
// =====================================================================

/** Publisher entity — referenced by @id from every other schema node. */
export function organizationLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    alternateName: ["ChessOX", "Chess Ox"],
    url: `${SITE_URL}/`,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/chessox-icon.ico"),
      caption: "ChessOx logo",
    },
    image: absoluteUrl(DEFAULT_OG_IMAGE),
    description: SITE_DESCRIPTION,
    email: CONTACT_EMAIL,
    sameAs: SOCIAL_PROFILES,
    areaServed: [{ "@type": "Country", name: "India" }, "Worldwide"],
    knowsAbout: [
      "Online chess",
      "Chess puzzles",
      "Chess tactics",
      "Chess openings",
      "Chess strategy",
      "Chess endgames",
      "Chess tournaments",
      "Chess rankings",
      "Chess for beginners",
      "Chess community",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: CONTACT_EMAIL,
      availableLanguage: ["English"],
    },
  };
}

/** The site itself. */
export function websiteLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    description: SITE_DESCRIPTION,
    inLanguage: "en",
    publisher: { "@id": ORG_ID },
  };
}

/**
 * The chess platform as a product — this is the node generative engines read
 * when asked "what can you do on ChessOx?".
 */
export function webApplicationLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${SITE_URL}/#webapp`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    applicationCategory: "GameApplication",
    applicationSubCategory: "Chess",
    operatingSystem: "Any modern web browser (Windows, macOS, Linux, Android, iOS)",
    browserRequirements: "Requires JavaScript.",
    description: SITE_DESCRIPTION,
    isAccessibleForFree: true,
    inLanguage: "en",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      description: "Free online chess — play, puzzles, lessons and tournaments at no cost.",
    },
    featureList: [
      "Play chess online against players worldwide with ranked quick match",
      "Play chess with friends online through a private invite link",
      "Play chess against the computer across five difficulty levels",
      "Local two-player chess on a single device",
      "Free online chess puzzles and timed Puzzle Rush tactics training",
      "Chess academy courses covering openings, strategy, tactics and endgames",
      "Opening explorer and analysis board with PGN import",
      "Online chess tournaments with brackets, arenas and prize pools",
      "Global and India-specific chess leaderboards and player rankings",
      "Chess clubs, community feed, chat rooms and chess news",
    ],
    audience: {
      "@type": "Audience",
      audienceType: "Chess players from complete beginners to advanced competitive players",
      geographicArea: [{ "@type": "Country", name: "India" }],
    },
    publisher: { "@id": ORG_ID },
  };
}

/** Generic page node. Pass `about`/`keywords` to sharpen entity understanding. */
export function webPageLd(input: {
  name: string;
  description: string;
  path: string;
  about?: string[];
  primaryTopic?: string;
}): JsonLd {
  const node: JsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${absoluteUrl(input.path)}#webpage`,
    name: input.name,
    url: absoluteUrl(input.path),
    description: input.description,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORG_ID },
  };
  if (input.about?.length) {
    node.about = input.about.map((t) => ({ "@type": "Thing", name: t }));
  }
  if (input.primaryTopic) {
    node.mainEntity = { "@type": "Thing", name: input.primaryTopic };
  }
  return node;
}

/** Breadcrumb trail. Pass items in order, starting from Home. */
export function breadcrumbLd(items: Array<{ name: string; path: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** FAQ schema. Only ever call this with questions that are visible on the page. */
export function faqLd(entries: Array<{ question: string; answer: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

/** Step-by-step guide schema (used by the "How to play chess" guide). */
export function howToLd(input: {
  name: string;
  description: string;
  path: string;
  /** `anchor` should match the id of the section that documents the step. */
  steps: Array<{ name: string; text: string; anchor?: string }>;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    inLanguage: "en",
    publisher: { "@id": ORG_ID },
    step: input.steps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.name,
      text: step.text,
      url: `${absoluteUrl(input.path)}#${step.anchor ?? `step-${i + 1}`}`,
    })),
  };
}

/** Listing pages (puzzles, tournaments, leaderboards, news, clubs…). */
export function collectionPageLd(input: {
  name: string;
  description: string;
  path: string;
  about?: string[];
}): JsonLd {
  const node = webPageLd(input);
  node["@type"] = "CollectionPage";
  return node;
}

/**
 * The newsroom byline used on ChessOx reporting. An Organization rather than a
 * Person, because the desk publishes collectively — Google accepts either as
 * `author`, and claiming a named individual we cannot stand behind would be
 * worse for E-E-A-T than an honest team credit.
 */
export const EDITORIAL_TEAM = {
  name: "ChessOx Editorial Team",
  path: "/editorial-team",
  byline: "ChessOx News Desk",
  description:
    "The ChessOx editorial team reports on competitive chess using primary sources — FIDE, national federations, official tournament sites and established chess media — and verifies every result, rating and date before publication.",
};

export const AUTHOR_ID = `${SITE_URL}${EDITORIAL_TEAM.path}#author`;

/** Author node, referenced by @id from NewsArticle. */
export function editorialTeamLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": AUTHOR_ID,
    name: EDITORIAL_TEAM.name,
    url: absoluteUrl(EDITORIAL_TEAM.path),
    description: EDITORIAL_TEAM.description,
    parentOrganization: { "@id": ORG_ID },
  };
}

/**
 * NewsArticle node for a published report. Every field maps to a real stored
 * value — nothing is synthesised. `dateModified` falls back to `datePublished`
 * when the record has never been edited.
 */
export function newsArticleLd(input: {
  headline: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string | null;
  image?: string | null;
  articleSection?: string | null;
  keywords?: string[];
  wordCount?: number;
}): JsonLd {
  const url = absoluteUrl(input.path);
  const node: JsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": `${url}#article`,
    headline: input.headline,
    description: input.description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: input.datePublished,
    dateModified: input.dateModified || input.datePublished,
    inLanguage: "en",
    isAccessibleForFree: true,
    author: { "@id": AUTHOR_ID },
    publisher: { "@id": ORG_ID },
    image: {
      "@type": "ImageObject",
      url: absoluteUrl(input.image || DEFAULT_OG_IMAGE),
      caption: input.headline,
    },
  };
  if (input.articleSection) node.articleSection = input.articleSection;
  if (input.keywords?.length) node.keywords = input.keywords.join(", ");
  if (input.wordCount) node.wordCount = input.wordCount;
  return node;
}

/** Academy course. Instructor names are intentionally omitted from schema. */
export function courseLd(input: {
  name: string;
  description: string;
  path: string;
  level?: string;
}): JsonLd {
  const node: JsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    inLanguage: "en",
    about: { "@type": "Thing", name: "Chess" },
    provider: { "@id": ORG_ID },
  };
  if (input.level) node.educationalLevel = input.level;
  return node;
}
