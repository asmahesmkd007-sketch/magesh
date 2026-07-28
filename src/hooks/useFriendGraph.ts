import { useCallback, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  sendFriendRequest as sendFriendRequestRpc,
  acceptFriendRequest as acceptFriendRequestRpc,
} from "@/lib/api/gameClient";

/**
 * A single shared cache of "my" friend relationships + outgoing blocks, keyed
 * by user id, so any number of <FriendButton> instances across completely
 * unrelated parts of the tree (leaderboard rows, chat messages, clan member
 * lists, ...) read from ONE fetch + ONE pair of realtime subscriptions
 * instead of each mounting its own — the same `friends` table, RPCs, and
 * `community_blocks` table the rest of the app already uses, just fanned
 * out efficiently. See useFriends.ts for the per-page equivalent this
 * mirrors (same table, same RPC wrappers).
 */

type FriendGraphRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "blocked";
};

type Snapshot = {
  rows: FriendGraphRow[];
  blockedIds: Set<string>;
  loading: boolean;
};

type Store = {
  snapshot: Snapshot;
  listeners: Set<() => void>;
  initialized: boolean;
};

const EMPTY_SNAPSHOT: Snapshot = { rows: [], blockedIds: new Set(), loading: true };
const stores = new Map<string, Store>();

function getStore(userId: string): Store {
  let store = stores.get(userId);
  if (!store) {
    store = { snapshot: EMPTY_SNAPSHOT, listeners: new Set(), initialized: false };
    stores.set(userId, store);
  }
  return store;
}

function setSnapshot(store: Store, patch: Partial<Snapshot>) {
  store.snapshot = { ...store.snapshot, ...patch };
  store.listeners.forEach((l) => l());
}

async function loadFriends(userId: string, store: Store) {
  const { data } = await supabase
    .from("friends")
    .select("id,requester_id,addressee_id,status")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  setSnapshot(store, { rows: (data ?? []) as FriendGraphRow[], loading: false });
}

async function loadBlocks(userId: string, store: Store) {
  const { data } = await supabase
    .from("community_blocks")
    .select("blocked_id")
    .eq("user_id", userId);
  setSnapshot(store, { blockedIds: new Set((data ?? []).map((r) => r.blocked_id)) });
}

/**
 * supabase.channel(topic) reuses an existing channel object if one with the
 * same topic is already registered on the (module-singleton) realtime
 * client — including one left over from a dev-mode HMR reload of this file,
 * which resets our `stores` Map but not the realtime client's own channel
 * list. Calling `.on()` on an already-`.subscribe()`d channel throws, so any
 * stale channel for this topic must be torn down first.
 */
async function freshChannel(topic: string) {
  const existing = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
  if (existing) await supabase.removeChannel(existing);
  return supabase.channel(topic);
}

/** Runs once per user id, on first subscribe (i.e. client-only, after mount — never during SSR/render). */
async function ensureInitialized(userId: string, store: Store) {
  if (store.initialized) return;
  store.initialized = true;
  loadFriends(userId, store);
  loadBlocks(userId, store);

  (await freshChannel(`friend-button-friends:${userId}`))
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "friends", filter: `requester_id=eq.${userId}` },
      () => loadFriends(userId, store),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "friends", filter: `addressee_id=eq.${userId}` },
      () => loadFriends(userId, store),
    )
    .subscribe();

  (await freshChannel(`friend-button-blocks:${userId}`))
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "community_blocks", filter: `user_id=eq.${userId}` },
      () => loadBlocks(userId, store),
    )
    .subscribe();
}

export type FriendRelation = {
  status: "none" | "outgoing" | "incoming" | "friends" | "blocked";
  rowId: string | null;
};

export function useFriendGraph(myUserId?: string | null) {
  const store = myUserId ? getStore(myUserId) : null;

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!store || !myUserId) return () => {};
      ensureInitialized(myUserId, store);
      store.listeners.add(onChange);
      return () => {
        store.listeners.delete(onChange);
      };
    },
    [store, myUserId],
  );
  const getSnapshot = useCallback(() => store?.snapshot ?? EMPTY_SNAPSHOT, [store]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT);

  const getRelation = useCallback(
    (otherId: string): FriendRelation => {
      if (!myUserId) return { status: "none", rowId: null };
      if (snapshot.blockedIds.has(otherId)) return { status: "blocked", rowId: null };
      const row = snapshot.rows.find(
        (r) =>
          (r.requester_id === myUserId && r.addressee_id === otherId) ||
          (r.requester_id === otherId && r.addressee_id === myUserId),
      );
      if (!row) return { status: "none", rowId: null };
      if (row.status === "blocked") return { status: "blocked", rowId: row.id };
      if (row.status === "accepted") return { status: "friends", rowId: row.id };
      return { status: row.requester_id === myUserId ? "outgoing" : "incoming", rowId: row.id };
    },
    [myUserId, snapshot],
  );

  async function sendRequest(otherId: string) {
    if (!myUserId || !store) return;
    await sendFriendRequestRpc(otherId);
    await loadFriends(myUserId, store);
  }

  async function acceptRequest(rowId: string) {
    if (!myUserId || !store) return;
    await acceptFriendRequestRpc(rowId);
    await loadFriends(myUserId, store);
  }

  /** Cancel an outgoing request or reject an incoming one — both are a plain delete. */
  async function cancelOrReject(rowId: string) {
    if (!myUserId || !store) return;
    await supabase.from("friends").delete().eq("id", rowId);
    await loadFriends(myUserId, store);
  }

  async function removeFriend(rowId: string, otherName?: string | null) {
    if (!myUserId || !store) return;
    await supabase.from("friends").delete().eq("id", rowId);
    const body = `You removed ${otherName ?? "a friend"}.`;
    await supabase.from("notifications").insert({
      user_id: myUserId,
      kind: "friend_removed",
      type: "friend_removed",
      title: "Friend removed",
      body,
      message: body,
      link: "/friends",
    });
    await loadFriends(myUserId, store);
  }

  return {
    loading: snapshot.loading,
    getRelation,
    sendRequest,
    acceptRequest,
    cancelOrReject,
    removeFriend,
  };
}
