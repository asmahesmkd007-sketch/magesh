import { createFileRoute, redirect } from "@tanstack/react-router";

type LoginSearch = {
  redirect?: string;
};

function sanitizeRedirect(target?: string): string | undefined {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return undefined;
  if (target.startsWith("/login") || target.startsWith("/auth")) {
    try {
      const parsed = new URL(target, "http://dummy.local");
      const inner = parsed.searchParams.get("redirect");
      return sanitizeRedirect(inner || undefined);
    } catch {
      return undefined;
    }
  }
  return target;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: ({ search }) => {
    const cleanTarget = sanitizeRedirect(search.redirect);
    throw redirect({
      to: "/auth",
      search: {
        mode: "signin",
        redirect: cleanTarget,
      },
    });
  },
});
