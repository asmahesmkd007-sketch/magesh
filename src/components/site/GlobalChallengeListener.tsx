import { useAuth } from "@/hooks/useAuth";
import { useChallenges } from "@/hooks/useChallenges";

/**
 * Global challenge listener mounted at root shell.
 * Ensures Player A (the sender of a friend challenge) receives realtime acceptance
 * events and automatically navigates to /game/$id no matter which page they are on.
 */
export function GlobalChallengeListener() {
  const { user } = useAuth();
  useChallenges(user?.id);
  return null;
}
