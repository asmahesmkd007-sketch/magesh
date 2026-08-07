import { createFileRoute, redirect } from "@tanstack/react-router";

type SignupSearch = {
  redirect?: string;
};

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): SignupSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/auth",
      search: {
        mode: "signup",
        redirect: search.redirect,
      },
    });
  },
});
