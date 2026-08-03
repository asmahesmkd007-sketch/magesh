import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Without defaults every query is born stale, so navigating away and back
  // re-issues the same request and shows a spinner over data that was
  // fetched seconds earlier — each one a ~320 ms round trip to Supabase.
  // A short staleTime makes return visits paint from cache immediately;
  // gcTime keeps that cache alive long enough for realistic back-and-forth.
  // Queries that need fresher data already set their own staleTime, and an
  // explicit option on a query always wins over these defaults.
  //
  // refetchOnWindowFocus is deliberately left at its default — turning it
  // off would silently change how stale a returning tab can be.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
