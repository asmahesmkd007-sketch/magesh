import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { respondClanInvite as respondClanInviteRpc } from "@/lib/api/gameClient";
import type { ClanInviteRow } from "@/types/friend";

export function useClanInvites(userId?: string | null) {
  const [invites, setInvites] = useState<ClanInviteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("clan_invites")
      .select("id,clan_id,inviter_id,invitee_id,status,created_at")
      .eq("invitee_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!data || data.length === 0) {
      setInvites([]);
      setLoading(false);
      return;
    }

    const clanIds = [...new Set(data.map((r) => r.clan_id))];
    const inviterIds = [...new Set(data.map((r) => r.inviter_id))];
    const [{ data: clans }, { data: inviters }, { data: leaders }] = await Promise.all([
      supabase.from("clans").select("id,name,tag,slug,logo_url,member_count").in("id", clanIds),
      supabase.from("profiles").select("id,username,full_name").in("id", inviterIds),
      supabase
        .from("clan_members")
        .select("clan_id,user_id")
        .in("clan_id", clanIds)
        .eq("role", "leader"),
    ]);
    const clanMap = new Map((clans ?? []).map((c) => [c.id, c]));
    const inviterMap = new Map((inviters ?? []).map((p) => [p.id, p]));

    const leaderUserIds = [...new Set((leaders ?? []).map((l) => l.user_id))];
    const { data: leaderProfiles } =
      leaderUserIds.length > 0
        ? await supabase.from("profiles").select("id,username,full_name").in("id", leaderUserIds)
        : { data: [] };
    const leaderProfileMap = new Map((leaderProfiles ?? []).map((p) => [p.id, p]));
    const leaderMap = new Map(
      (leaders ?? []).map((l) => {
        const p = leaderProfileMap.get(l.user_id);
        return [l.clan_id, p?.full_name ?? p?.username ?? null];
      }),
    );

    setInvites(
      data.map((r) => {
        const clan = clanMap.get(r.clan_id);
        const inviter = inviterMap.get(r.inviter_id);
        return {
          ...r,
          clan_name: clan?.name ?? null,
          clan_tag: clan?.tag ?? null,
          clan_slug: clan?.slug ?? null,
          clan_logo_url: clan?.logo_url ?? null,
          clan_member_count: clan?.member_count ?? null,
          clan_leader_name: leaderMap.get(r.clan_id) ?? null,
          inviter_username: inviter?.username ?? null,
          inviter_display: inviter?.full_name ?? null,
        } as ClanInviteRow;
      }),
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`clan_invites:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clan_invites", filter: `invitee_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, load]);

  async function respond(id: string, accept: boolean) {
    await respondClanInviteRpc(id, accept);
    await load();
  }

  return { invites, loading, respond, refresh: load };
}
