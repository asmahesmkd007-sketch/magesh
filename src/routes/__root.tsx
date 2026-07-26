import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
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
          "play chess online, online chess game, free online chess, chess puzzles, online chess tournament, chess leaderboard, learn chess online, online chess India",
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
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/chessox-icon.ico", type: "image/x-icon", sizes: "any" },
      { rel: "apple-touch-icon", href: "/chessox-icon.ico" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800;900&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap",
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

        // Automatically seed daily tournaments if none are upcoming
        (supabase as unknown as { rpc: (fn: string) => Promise<unknown> })
          .rpc("seed_daily_tournaments")
          .catch(() => {});

        // Pull the user's saved game settings so they follow them across devices.
        import("@/lib/settings/settings-sync").then((m) => m.loadSettingsOnce()).catch(() => {});

        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
          router.invalidate();
          if (event !== "SIGNED_OUT") queryClient.invalidateQueries();

          if (event === "SIGNED_IN" && session?.user) {
            stopPresence?.();
            stopPresence = startPresence(supabase, session.user.id);
            import("@/lib/settings/settings-sync")
              .then((m) => m.loadSettingsFromDb(session.user.id))
              .catch(() => {});
            // Update login streak (idempotent per calendar day — safe to call on every sign-in)
            (supabase as unknown as { rpc: (fn: string) => Promise<unknown> })
              .rpc("update_login_streak")
              .catch(() => {});
          }
          if (event === "SIGNED_OUT") {
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

  return (
    <QueryClientProvider client={queryClient}>
      <SettingsEffects />
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <main>
          <Outlet />
        </main>
        <Footer />
        <MobileNav />
        <div className="h-16 lg:hidden" />
        <Toaster theme="dark" position="top-right" richColors />
      </div>
    </QueryClientProvider>
  );
}
