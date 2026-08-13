import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  getPresenceSnapshot,
  queuePresenceFetch,
  subscribePresence,
} from "@/realtime/client/presenceStore";
import type { PresenceState, UserPresence } from "@/realtime/protocol";
import { useAuth } from "./useAuth";

export type UsePresenceResult = {
  status: PresenceState;
  isOnline: boolean;
  presence: UserPresence | undefined;
};

/**
 * React Hook to subscribe to a user's real-time online/offline presence status.
 * Automatically updates live without page refresh.
 */
export function usePresence(userId?: string | null): UsePresenceResult {
  const { user } = useAuth();
  const isMe = !!(userId && user && user.id === userId);

  const getSnapshot = useCallback(() => {
    return getPresenceSnapshot(userId);
  }, [userId]);

  const presence = useSyncExternalStore(subscribePresence, getSnapshot, getSnapshot);

  useEffect(() => {
    if (userId && !presence) {
      // Coalesced with every other avatar mounting in this same commit, so
      // a list of N players costs one request rather than N.
      void queuePresenceFetch(userId);
    }
  }, [userId, presence]);

  const status: PresenceState = presence
    ? presence.status
    : isMe
      ? "online"
      : "offline";

  const isOnline = status === "online";

  return {
    status,
    isOnline,
    presence,
  };
}
