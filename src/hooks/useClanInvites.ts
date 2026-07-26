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
    // clan_invites isn't in the generated Supabase types yet (schema.sql vs
    // live DB drift — see project memory), so query it loosely-typed.
    const { data: rawData } = await (supabase as any)
      .from("clan_invites")
      .select("id,clan_id,inviter_id,invitee_id,status,created_at")
      .eq("invitee_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    const data: any[] | null = rawData;

    if (!data || data.length === 0) {
      setInvites([]);
      setLoading(false);
      return;
    }

    const clanIds: string[] = [...new Set(data.map((r) => r.clan_id as string))];
    const inviterIds: string[] = [...new Set(data.map((r) => r.inviter_id as string))];
    const [{ data: clans }, { data: inviters }] = await Promise.all([
      supabase.from("clans").select("id,name,tag,slug,logo_url").in("id", clanIds),
      supabase.from("profiles").select("id,username,full_name").in("id", inviterIds),
    ]);
    const clanMap = new Map((clans ?? []).map((c: any) => [c.id, c]));
    const inviterMap = new Map((inviters ?? []).map((p: any) => [p.id, p]));

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
