import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/RequireAuth";

export const Route = createFileRoute("/room")({
  component: () => (
    <RequireAuth>
      <Outlet />
    </RequireAuth>
  ),
});
