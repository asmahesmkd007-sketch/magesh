import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useChallenges } from "@/hooks/useChallenges";
import { useGameSettings } from "@/hooks/useGameSettings";
import { isNotificationKindEnabled } from "@/lib/notificationCategories";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { handleNotificationClick } from "@/lib/activeMatch";

type NotifPayload = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
};

async function freshChannel(topic: string) {
  const existing = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
  if (existing) await supabase.removeChannel(existing);
  return supabase.channel(topic);
}

/**
 * Global listener mounted at root shell.
 * 1. Ensures Player A receives challenge acceptance and auto-navigates.
 * 2. Listens to all incoming site-wide notifications in realtime and displays
 *    a 5-second top-right toast popup for any new notification.
 */
export function GlobalChallengeListener() {
  const { user } = useAuth();
  const { settings } = useGameSettings();
  const navigate = useNavigate();
  useChallenges(user?.id);

  useEffect(() => {
    if (!user) return;
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const prefs = {
      notify_tournament_starting: settings.notify_tournament_starting,
      notify_challenge_received: settings.notify_challenge_received,
      notify_community: settings.notify_community,
    };

    freshChannel(`global_notifs:${user.id}`).then((ch) => {
      if (cancelled) return;
      activeChannel = ch.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (p) => {
          const n = p.new as NotifPayload;
          // The user's per-category notification preferences still decide
          // whether a toast appears at all — unchanged.
          if (!isNotificationKindEnabled(n.kind, prefs)) return;
          // A notification during a live game still arrives and still
          // shows. Only the *navigation* is suppressed, by the guard
          // inside handleNotificationClick, so the board is never torn
          // down mid-game by a stray tap.
          toast.info(n.title, {
            description: n.body ?? undefined,
            duration: 5000,
            action: {
              label: "View",
              onClick: () => handleNotificationClick(navigate),
            },
          });
        },
      );
      activeChannel.subscribe();
    });

    return () => {
      cancelled = true;
      if (activeChannel) {
        supabase.removeChannel(activeChannel);
      }
    };
  }, [
    user,
    navigate,
    settings.notify_tournament_starting,
    settings.notify_challenge_received,
    settings.notify_community,
  ]);

  return null;
}
