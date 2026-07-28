import type { GameSettings } from "@/lib/settings/schema";

/**
 * Maps a `public.notifications.kind` value to the Settings > Notifications
 * toggle that gates whether the user wants to see it. Built from every
 * `kind` literal actually inserted server-side (see supabase/schema.sql) —
 * tournament lifecycle events, challenges, and clan/community activity.
 *
 * `notify_wallet`, `notify_withdrawal`, `notify_match_found`,
 * `notify_friend_online` and `notify_admin` have no matching entry here:
 * nothing in the backend currently inserts a notification row of that kind
 * (wallet/withdrawal updates are surfaced as toasts at the point of action,
 * not via the notifications table; there's no "friend came online" or
 * "match found" event producer yet). A kind with no mapping is always
 * shown — filtering only applies where there's a real category to filter.
 */
const CATEGORY_BY_KIND: Partial<Record<string, keyof GameSettings>> = {
  tournament_locked: "notify_tournament_starting",
  tournament_live: "notify_tournament_starting",
  tournament_warning: "notify_tournament_starting",
  tournament_round: "notify_tournament_starting",
  tournament_result: "notify_tournament_starting",
  tournament_cancelled: "notify_tournament_starting",
  tournament_prize: "notify_tournament_starting",
  tournament_finished: "notify_tournament_starting",
  round_finished: "notify_tournament_starting",

  challenge: "notify_challenge_received",

  clan_request: "notify_community",
  clan_accepted: "notify_community",
  clan_rejected: "notify_community",
  clan_promotion: "notify_community",
  clan_demotion: "notify_community",
  clan_kick: "notify_community",
  clan_transfer: "notify_community",
  clan_disband: "notify_community",
  clan_war: "notify_community",
  puzzle: "notify_community",
};

/** The subset of GameSettings this module reads — for narrow hook deps. */
export type NotificationPrefs = Pick<
  GameSettings,
  "notify_tournament_starting" | "notify_challenge_received" | "notify_community"
>;

export function isNotificationKindEnabled(kind: string, settings: NotificationPrefs): boolean {
  const key = CATEGORY_BY_KIND[kind];
  if (!key) return true;
  return settings[key as keyof NotificationPrefs] !== false;
}
