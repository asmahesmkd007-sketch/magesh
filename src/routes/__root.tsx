import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { Footer } from "@/components/site/Footer";
import { MobileNav } from "@/components/site/MobileNav";
import { Navbar } from "@/components/site/Navbar";
import { SettingsEffects } from "@/components/site/SettingsEffects";
import { reportLovableError } from "../lib/lovable-error-reporting";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  TWITTER_HANDLE,
  absoluteUrl,
  DEFAULT_OG_IMAGE,
  organizationLd,
  websiteLd,
} from "@/lib/seo";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

// Last identity the app invalidated for. Module-scoped so it survives an
// effect re-run: `null` legitimately means "signed out", and a signed-out
// visitor receiving INITIAL_SESSION(null) is not an identity change, so
// anonymous page loads now skip the invalidation pass entirely.
let lastAuthUserId: string | null = null;

const SEED_THROTTLE_KEY = "chessox:lastDailySeed";
const SEED_THROTTLE_MS = 60 * 60 * 1000;

/** True at most once an hour per browser. Best-effort; failures just allow the call. */
function shouldSeedDailyTournaments(): boolean {
  try {
    const last = Number(localStorage.getItem(SEED_THROTTLE_KEY) ?? 0);
    if (Number.isFinite(last) && Date.now() - last < SEED_THROTTLE_MS) return false;
    localStorage.setItem(SEED_THROTTLE_KEY, String(Date.now()));
  } catch {
    /* private mode / storage disabled — fall through and just make the call */
  }
  return true;
}

function NotFoundComponent() {
  return (
    <div className="grid min-h-screen place-items-center px-4 bg-page">
      <div className="royal-panel max-w-md rounded-[28px] p-10 text-center">
        <div className="text-[11px] uppercase tracking-[0.26em] text-gold/70">Error 404</div>
        <h1 className="mt-4 text-5xl text-gradient-gold">Page not found</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          This chamber of ChessOx has not been opened yet.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex rounded-xl gradient-gold px-5 py-2.5 text-sm font-medium text-background"
        >
          Return home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  console.error(error);

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center px-4 bg-page">
      <div className="royal-panel max-w-md rounded-[28px] p-10 text-center">
        <div className="text-[11px] uppercase tracking-[0.26em] text-gold/70">Unexpected move</div>
        <h1 className="mt-4 text-4xl text-gradient-gold">Something went wrong</h1>
        <p className="mt-4 text-sm text-red-400">{error.message}</p>
        <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap text-left max-h-40 overflow-y-auto">
          {error.stack}
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-xl gradient-gold px-4 py-2 text-sm font-medium text-background"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-xl border border-gold/25 px-4 py-2 text-sm text-foreground"
          >
            Home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    // Site-wide defaults. Any page that calls `seo()` overrides the entries
    // below for its own route (deepest match wins per meta name/property).
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ChessOx — Play Chess Online Free, Puzzles & Tournaments" },
      { name: "description", content: SITE_DESCRIPTION },
      {
        name: "keywords",
        content:
          "play chess online, online chess game, free online chess, chess puzzles, online chess tournament, chess ranking, learn chess online, online chess India",
      },
      {
        name: "robots",
        content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      },
      { name: "application-name", content: SITE_NAME },
      { name: "author", content: SITE_NAME },
      { name: "publisher", content: SITE_NAME },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:locale", content: "en_IN" },
      { property: "og:title", content: "ChessOx — Play Chess Online Free, Puzzles & Tournaments" },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:image", content: absoluteUrl(DEFAULT_OG_IMAGE) },
      {
        property: "og:image:alt",
        content: "ChessOx — a hand-carved chess set with gold inlay",
      },
      { name: "theme-color", content: "#D4AF37" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: TWITTER_HANDLE },
      { name: "twitter:creator", content: TWITTER_HANDLE },
      { name: "twitter:image", content: absoluteUrl(DEFAULT_OG_IMAGE) },
      { name: "twitter:title", content: "ChessOx — Play Chess Online Free, Puzzles & Tournaments" },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      // Entity graph for search engines and AI answer engines. Present on
      // every page; individual routes add their own WebPage/Breadcrumb nodes.
      { "script:ld+json": organizationLd() },
      { "script:ld+json": websiteLd() },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/chessox-icon.png", type: "image/png", sizes: "256x256" },
      { rel: "apple-touch-icon", href: "/chessox-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        // Cinzel 800 dropped: `font-extrabold` has zero uses site-wide and no
        // rule sets font-weight:800, so nothing could ever render it. 900 is
        // kept — clans.index.tsx pairs font-black with font-display.
        href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;900&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    let sub: { unsubscribe: () => void } | null = null;
    let stopPresence: (() => void) | null = null;

    Promise.all([import("@/integrations/supabase/client"), import("@/lib/presence")]).then(
      ([{ supabase }, { startPresence }]) => {
        if (!mounted) return;

        // Automatically seed daily tournaments if none are upcoming.
        // Wrapped in Promise.resolve(): supabase-js's rpc() builder is
        // thenable but doesn't implement the full Promise interface, so
        // chaining .catch() straight onto it throws
        // "supabase.rpc(...).catch is not a function" on every page load.
        //
        // Throttled per browser: this is a write RPC that every visitor was
        // firing on every single page load, so the database did N seeding
        // round-trips per user per session to discover there was nothing to
        // seed. Daily tournaments only need seeding once a day, so one call
        // per hour per browser is still far more often than necessary.
        if (shouldSeedDailyTournaments()) {
          Promise.resolve(
            (supabase as unknown as { rpc: (fn: string) => Promise<unknown> }).rpc(
              "seed_daily_tournaments",
            ),
          ).catch(() => {});
        }

        // Pull the user's saved game settings so they follow them across devices.
        import("@/lib/settings/settings-sync").then((m) => m.loadSettingsOnce()).catch(() => {});

        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          // Only a real identity change invalidates. This used to run on
          // every event, and `INITIAL_SESSION` fires on every page load —
          // so each load re-ran every route loader and refetched every
          // React Query cache entry milliseconds after the page had already
          // rendered them, doubling the requests behind first paint.
          // `TOKEN_REFRESHED` (hourly, same user) did the same for nothing.
          const nextUserId = session?.user?.id ?? null;
          if (nextUserId !== lastAuthUserId) {
            lastAuthUserId = nextUserId;
            router.invalidate();
            if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
          }

          if (session?.user) {
            stopPresence?.();
            stopPresence = startPresence(supabase, session.user.id);
            if (event === "SIGNED_IN") {
              import("@/lib/settings/settings-sync")
                .then((m) => m.loadSettingsFromDb(session.user.id))
                .catch(() => {});
              // Update login streak (idempotent per calendar day — safe to call on every sign-in).
              // Same Promise.resolve() wrap as above, for the same reason.
              Promise.resolve(
                (supabase as unknown as { rpc: (fn: string) => Promise<unknown> }).rpc(
                  "update_login_streak",
                ),
              ).catch(() => {});
            }
          } else {
            stopPresence?.();
            stopPresence = null;
          }
        });
        sub = data.subscription;
      },
    );

    return () => {
      mounted = false;
      sub?.unsubscribe();
      stopPresence?.();
    };
  }, [router, queryClient]);

  const isGameRoute = useRouterState({
    select: (s) => s.location.pathname.startsWith("/game/"),
  });

  useEffect(() => {
    if (isGameRoute) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [isGameRoute]);

  return (
    <QueryClientProvider client={queryClient}>
      <SettingsEffects />
      <div
        className={`bg-background text-foreground ${
          isGameRoute ? "h-screen max-h-screen overflow-hidden flex flex-col" : "min-h-screen"
        }`}
      >
        {!isGameRoute && <Navbar />}
        <main className={isGameRoute ? "flex-1 overflow-hidden" : ""}>
          <Outlet />
        </main>
        {!isGameRoute && <Footer />}
        {!isGameRoute && <MobileNav />}
        {!isGameRoute && <div className="h-16 lg:hidden" />}
        <Toaster theme="dark" position="top-right" richColors />
      </div>
    </QueryClientProvider>
  );
}
