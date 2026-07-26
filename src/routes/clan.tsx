import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/clan")({
  component: () => <Outlet />,
});
