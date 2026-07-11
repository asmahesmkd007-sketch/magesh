import { useEffect, useState } from "react";
import { Check, X, ShieldAlert } from "lucide-react";
import { Card, SectionTitle } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface JoinRequest {
  id: string;
  user_id: string;
  created_at: string;
  profiles: {
    username: string;
    avatar_url: string | null;
  } | null;
}

interface Props {
  clanId: string;
  myRole: "leader" | "co_leader" | "member" | null;
}

export function ClanSettingsTab({ clanId, myRole }: Props) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  useEffect(() => {
    if (myRole !== "leader" && myRole !== "co_leader") return;

    supabase
      .from("clan_join_requests")
      .select("id,user_id,created_at,profiles(username,avatar_url)")
      .eq("clan_id", clanId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setRequests(data as unknown as JoinRequest[]);
        setLoading(false);
      });
  }, [clanId, myRole]);

  async function handleRequest(id: string, action: "approve" | "reject") {
    setActioning(id);
    try {
      if (action === "approve") {
        const { error } = await supabase.rpc("clan_approve_join", { p_request_id: id });
        if (error) throw error;
        toast.success("Request approved!");
      } else {
        const { error } = await supabase
          .from("clan_join_requests")
          .update({ status: "rejected" })
          .eq("id", id);
        if (error) throw error;
        toast.success("Request rejected");
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || `Failed to ${action} request`);
    } finally {
      setActioning(null);
    }
  }

  if (myRole !== "leader" && myRole !== "co_leader") {
    return (
      <Card className="p-10 text-center flex flex-col items-center justify-center h-[300px]">
        <ShieldAlert className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-xl font-display mb-2">Restricted Access</h3>
        <p className="text-muted-foreground">Only clan leaders and co-leaders can view settings.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <SectionTitle kicker="Recruitment" title="Join Requests" />
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading requests...</div>
        ) : requests.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground bg-black/20 rounded-lg border border-white/5 mt-4">
            No pending join requests.
          </div>
        ) : (
          <div className="space-y-3 mt-4">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-black/20">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-white/5 grid place-items-center font-display text-gold">
                    {r.profiles?.username?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{r.profiles?.username}</div>
                    <div className="text-xs text-muted-foreground">Requested {new Date(r.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRequest(r.id, "approve")}
                    disabled={actioning === r.id}
                    className="p-2 rounded-md bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30 transition-colors"
                    title="Approve"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleRequest(r.id, "reject")}
                    disabled={actioning === r.id}
                    className="p-2 rounded-md bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors"
                    title="Reject"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      
      {myRole === "leader" && (
        <Card className="p-6 border-destructive/20">
          <SectionTitle kicker="Danger Zone" title="Clan Management" />
          <p className="text-sm text-muted-foreground mt-2 mb-4">
            If you want to edit clan details or disband the clan, that functionality will be added here soon.
          </p>
        </Card>
      )}
    </div>
  );
}
