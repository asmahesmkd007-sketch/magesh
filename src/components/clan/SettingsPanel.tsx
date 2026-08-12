import { useEffect, useState } from "react";
import { Check, X, ShieldAlert, Pencil, Trash2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import {
  getJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  disbandClan,
  generateInviteLink,
  ClanApiError,
} from "@/lib/clanApi";
import { MemberAvatar, PanelEmpty } from "@/components/clan/ClanPrimitives";
import { ClanFormModal } from "@/components/clan/ClanFormModal";
import { ConfirmModal } from "@/components/site/ConfirmModal";
import type { Clan, ClanJoinRequest, ClanRole } from "@/types/clan";

interface Props {
  clan: Clan;
  myRole: ClanRole | null;
  onChanged: () => void | Promise<void>;
}

export function SettingsPanel({ clan, myRole, onChanged }: Props) {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ClanJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showDisbandConfirm, setShowDisbandConfirm] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const isOfficer = myRole === "leader" || myRole === "co_leader";

  async function handleGenerateInvite() {
    setGeneratingLink(true);
    try {
      const token = await generateInviteLink(clan.id);
      setInviteLink(token);
    } catch (err) {
      toast.error(err instanceof ClanApiError ? err.message : "Failed to generate link");
    } finally {
      setGeneratingLink(false);
    }
  }

  useEffect(() => {
    if (!isOfficer) return;
    getJoinRequests(clan.id)
      .then(setRequests)
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, [clan.id, isOfficer]);

  async function handleRequest(id: string, action: "approve" | "reject") {
    setActioning(id);
    try {
      if (action === "approve") await approveJoinRequest(id);
      else await rejectJoinRequest(id);
      toast.success(action === "approve" ? "Request approved!" : "Request rejected");
      setRequests((prev) => prev.filter((r) => r.id !== id));
      if (action === "approve") await onChanged();
    } catch (err) {
      toast.error(err instanceof ClanApiError ? err.message : `Failed to ${action} request`);
    } finally {
      setActioning(null);
    }
  }

  async function handleDisbandConfirm() {
    try {
      await disbandClan(clan.id);
      toast.success("Clan disbanded");
      navigate({ to: "/clans" });
    } catch (err) {
      toast.error(err instanceof ClanApiError ? err.message : "Failed to disband clan");
    }
  }

  if (!isOfficer) {
    return (
      <PanelEmpty
        icon={ShieldAlert}
        title="Restricted Access"
        hint="Only clan leaders and co-leaders can view settings."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Clan details */}
      <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg text-white">Clan Details</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Update your clan's identity, images, and privacy.
            </p>
          </div>
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
          >
            <Pencil className="h-4 w-4" /> Edit Clan
          </button>
        </div>
      </section>

      {/* Join requests */}
      <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
        <h3 className="font-display text-lg text-white">Join Requests</h3>
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading requests...</div>
        ) : requests.length === 0 ? (
          <div className="mt-4 rounded-xl border border-white/5 bg-black/20 py-8 text-center text-sm text-muted-foreground">
            <Inbox className="mx-auto mb-2 h-6 w-6 opacity-40" />
            No pending join requests.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 p-3"
              >
                <div className="flex items-center gap-3">
                  <MemberAvatar
                    username={r.profiles?.username}
                    avatarUrl={r.profiles?.avatar_url}
                  />
                  <div>
                    <div className="text-sm font-medium text-white">{r.profiles?.username}</div>
                    <div className="text-xs text-muted-foreground">
                      Requested {new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRequest(r.id, "approve")}
                    disabled={actioning === r.id}
                    className="rounded-lg bg-emerald-500/20 p-2 text-emerald-500 transition-colors hover:bg-emerald-500/30 disabled:opacity-50"
                    title="Approve"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleRequest(r.id, "reject")}
                    disabled={actioning === r.id}
                    className="rounded-lg bg-destructive/20 p-2 text-destructive transition-colors hover:bg-destructive/30 disabled:opacity-50"
                    title="Reject"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Invite links */}
      {clan.privacy === "invite_only" && isOfficer && (
        <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
          <h3 className="font-display text-lg text-white">Invite Links</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate a single-use invite link to allow a player to bypass the request queue. This
            link will expire after one use.
          </p>
          <div className="mt-4">
            {inviteLink ? (
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteLink}
                  className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none"
                  onClick={(e) => e.currentTarget.select()}
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLink);
                    toast.success("Link copied to clipboard");
                  }}
                  className="rounded-xl bg-gold/20 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/30"
                >
                  Copy
                </button>
                <button
                  onClick={() => setInviteLink(null)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-muted-foreground hover:bg-white/10"
                  title="Generate another"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleGenerateInvite}
                disabled={generatingLink}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                {generatingLink ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <span className="text-lg leading-none">+</span>
                )}
                Generate Link
              </button>
            )}
          </div>
        </section>
      )}

      {/* Danger zone */}
      {myRole === "leader" && (
        <section className="rounded-2xl border border-destructive/20 bg-destructive/[0.03] p-5">
          <h3 className="font-display text-lg text-white">Danger Zone</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Disbanding permanently deletes the clan for every member. To hand off the clan instead,
            use "Transfer Leadership" from the Members tab.
          </p>
          <button
            onClick={() => setShowDisbandConfirm(true)}
            className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/40 px-4 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" /> Disband Clan
          </button>
        </section>
      )}

      {showEdit && (
        <ClanFormModal
          mode="edit"
          clan={clan}
          onClose={() => setShowEdit(false)}
          onSaved={onChanged}
        />
      )}

      <ConfirmModal
        isOpen={showDisbandConfirm}
        onClose={() => setShowDisbandConfirm(false)}
        onConfirm={handleDisbandConfirm}
        title={`Disband ${clan.name}?`}
        description="This permanently deletes the clan, its chat, and all member records."
        confirmText="Disband Clan"
        cancelText="Cancel"
        variant="danger"
        icon={<Trash2 className="h-6 w-6 text-rose-400" />}
      />
    </div>
  );
}
