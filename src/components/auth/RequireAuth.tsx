import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type RequireAuthProps = {
  children: ReactNode;
};

export function RequireAuth({ children }: RequireAuthProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      const searchStr = typeof location.searchStr === "string" ? location.searchStr : "";
      const redirectPath = location.pathname + searchStr;
      navigate({
        to: "/login",
        search: { redirect: redirectPath },
        replace: true,
      });
    }
  }, [loading, user, location.pathname, location.searchStr, navigate]);

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-8">
        <div className="flex flex-col items-center gap-3 text-gold/80">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-xs uppercase tracking-[0.2em]">Verifying access…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
