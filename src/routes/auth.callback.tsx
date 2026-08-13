import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Crown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { acquireSessionServerFn } from "@/lib/api/session.functions";
import { getDeviceId, resetSessionId } from "@/lib/auth/sessionLock";
import { noindexSeo } from "@/lib/seo";

type CallbackSearch = {
  redirect?: string;
  code?: string;
  error?: string;
  error_description?: string;
};

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (search: Record<string, unknown>): CallbackSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    code: typeof search.code === "string" ? search.code : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
    error_description:
      typeof search.error_description === "string" ? search.error_description : undefined,
  }),
  head: () =>
    noindexSeo(
      "Signing In — ChessOx",
      "Completing authentication and setting up your ChessOx session.",
    ),
  component: AuthCallbackPage,
});

function getSafeTarget(target?: string): string {
  if (target && target.startsWith("/") && !target.startsWith("//")) {
    return target;
  }
  return "/home";
}

function AuthCallbackPage() {
  const search = Route.useSearch();
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(search.error_description || search.error || null);

  useEffect(() => {
    let alive = true;

    async function processCallback() {
      if (search.error || search.error_description) {
        if (alive) {
          setErrorMsg(search.error_description || search.error || "Authentication failed.");
        }
        return;
      }

      try {
        let currentSession = session;

        // 1. If PKCE code is provided in URL search parameters, exchange it explicitly
        if (!currentSession && search.code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(search.code);
          if (error) throw error;
          currentSession = data.session;
        }

        // 2. Fallback to getSession if auth state listener hasn't updated yet
        if (!currentSession && !authLoading) {
          const { data } = await supabase.auth.getSession();
          currentSession = data.session;
        }

        // Still loading auth state
        if (!currentSession) {
          if (authLoading) return; // Wait for useAuth subscription to settle
          throw new Error("Could not verify session after Google authentication.");
        }

        // 3. Acquire session lock for multi-device protection
        const deviceId = getDeviceId();
        const sessionId = resetSessionId();
        const lockRes = await acquireSessionServerFn({
          data: {
            userId: currentSession.user.id,
            sessionId,
            deviceId,
          },
        });

        if (!lockRes.ok) {
          await supabase.auth.signOut();
          if (alive) {
            setErrorMsg(
              lockRes.message ||
                "This user is already logged in on another device. Please log out from the other device or wait until that session expires.",
            );
          }
          return;
        }

        if (!alive) return;

        // 4. Check profile completion status to determine target route
        const targetPath = getSafeTarget(search.redirect);
        const isCompleted = !!currentSession.user.user_metadata?.profile_completed;

        if (!isCompleted) {
          navigate({ to: "/onboarding", replace: true });
        } else {
          navigate({ to: targetPath, replace: true });
        }
      } catch (err) {
        if (alive) {
          setErrorMsg(err instanceof Error ? err.message : "Authentication error.");
        }
      }
    }

    void processCallback();

    return () => {
      alive = false;
    };
  }, [session, authLoading, search.code, search.error, search.error_description, search.redirect, navigate]);

  if (errorMsg) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0f0505] p-6">
        <div className="w-full max-w-md rounded-2xl border border-gold/20 bg-black/60 p-8 backdrop-blur-md text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl gradient-gold text-background">
            <Crown className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl text-ivory mb-2">Authentication Failed</h1>
          <p className="text-sm text-destructive mb-6">{errorMsg}</p>
          <button
            onClick={() => navigate({ to: "/auth", replace: true })}
            className="w-full rounded-xl border border-gold/30 bg-gold/10 py-3 text-sm font-medium text-gold hover:bg-gold/20 transition-all"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0f0505] p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl gradient-gold text-background shadow-[0_0_30px_rgba(212,175,55,0.3)]">
          <Crown className="h-8 w-8" />
        </div>
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
        <p className="font-display text-lg tracking-wide text-ivory">Completing Sign In…</p>
        <p className="text-xs text-foreground/50">Establishing secure session on ChessOx</p>
      </div>
    </div>
  );
}
