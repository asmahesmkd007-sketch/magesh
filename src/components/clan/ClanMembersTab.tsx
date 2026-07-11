import { useState } from "react";
import { Crown, MoreVertical, Shield, ShieldOff, UserX } from "lucide-react";
import { Card, SectionTitle } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PremiumBadge } from "@/components/site/PremiumBadge";

interface Member {
  id: string;
  user_id: string;
  role: "leader" | "co_leader" | "member";
  joined_at: string;
  profiles: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    premium_active?: boolean;
    premium_expires_at?: string | null;
  } | null;
}

interface Props {
  members: Member[];
  myRole: "leader" | "co_leader" | "member" | null;
  clanId: string;
  onMembersUpdated: () => void;
}

export function ClanMembersTab({ members, myRole, clanId, onMembersUpdated }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  async function handleAction(memberId: string, userId: string, action: "promote" | "demote" | "kick") {
    setLoading(memberId);
    setMenuOpen(null);
    try {
      if (action === "promote") {
        const { error } = await supabase.rpc("clan_promote_member", { p_clan_id: clanId, p_user_id: userId });
        if (error) throw error;
        toast.success("Member promoted to Co-Leader");
      } else if (action === "demote") {
        const { error } = await supabase.rpc("clan_demote_member", { p_clan_id: clanId, p_user_id: userId });
        if (error) throw error;
        toast.success("Co-Leader demoted to Member");
      } else if (action === "kick") {
        const { error } = await supabase.rpc("clan_kick_member", { p_clan_id: clanId, p_user_id: userId });
        if (error) throw error;
        toast.success("Member kicked from clan");
      }
      onMembersUpdated();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || `Failed to ${action} member`);
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card className="p-6">
      <SectionTitle kicker="Court" title="Clan Members" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
        {members.map(m => {
          const isMe = m.user_id === (supabase as any).auth?.user?.()?.id;
          const canManage = (myRole === "leader" || (myRole === "co_leader" && m.role === "member")) && !isMe;

          return (
            <div key={m.id} className="relative flex items-center justify-between gap-3 p-3 rounded-lg border border-white/5 bg-black/20 hover:bg-black/40 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                {m.profiles?.avatar_url ? (
                  <img src={m.profiles.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover bg-white/5" />
                ) : (
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-white/5 font-display text-gold shrink-0">
                    {m.profiles?.username[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate flex items-center gap-1.5">
                    {m.profiles?.username}
                    <PremiumBadge 
                      premiumActive={m.profiles?.premium_active} 
                      premiumExpiresAt={m.profiles?.premium_expires_at} 
                    />
                  </div>
                  <div className={`text-xs capitalize flex items-center gap-1 mt-0.5 ${m.role !== 'member' ? 'text-gold' : 'text-muted-foreground'}`}>
                    {m.role !== 'member' && <Crown className="h-3 w-3" />}
                    {m.role.replace('_', ' ')}
                  </div>
                </div>
              </div>

              {canManage && (
                <div>
                  <button 
                    onClick={() => setMenuOpen(menuOpen === m.id ? null : m.id)}
                    className="p-2 text-muted-foreground hover:text-white rounded-full hover:bg-white/10"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  
                  {menuOpen === m.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
                      <div className="absolute right-2 top-12 z-50 w-48 rounded-md border border-white/10 bg-[#161920] shadow-xl py-1">
                        {myRole === "leader" && m.role === "member" && (
                          <button 
                            onClick={() => handleAction(m.id, m.user_id, "promote")}
                            disabled={loading === m.id}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-white/5"
                          >
                            <Shield className="h-4 w-4 text-emerald-500" /> Promote to Co-Leader
                          </button>
                        )}
                        {myRole === "leader" && m.role === "co_leader" && (
                          <button 
                            onClick={() => handleAction(m.id, m.user_id, "demote")}
                            disabled={loading === m.id}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-white/5"
                          >
                            <ShieldOff className="h-4 w-4 text-orange-500" /> Demote to Member
                          </button>
                        )}
                        <button 
                          onClick={() => handleAction(m.id, m.user_id, "kick")}
                          disabled={loading === m.id}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-white/5 text-destructive"
                        >
                          <UserX className="h-4 w-4" /> Kick from Clan
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
