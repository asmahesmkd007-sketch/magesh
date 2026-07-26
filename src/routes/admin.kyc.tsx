import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, ShieldX, IdCard, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { listKycRequests, reviewKyc, type AdminKycRequest } from "@/lib/api/adminClient";

export const Route = createFileRoute("/admin/kyc")({
  head: () => ({
    meta: [
      { title: "Admin — KYC Review — ChessOx" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AdminShell title="KYC Review">
      <KycPage />
    </AdminShell>
  ),
});

const TABS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
] as const;

function KycPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("pending");
  const [rows, setRows] = useState<AdminKycRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState<AdminKycRequest | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      setRows(await listKycRequests(status));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load KYC requests");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  async function approve(id: string) {
    try {
      await reviewKyc(id, true);
      toast.success("KYC approved");
      load(tab);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    }
  }

  async function confirmReject() {
    if (!rejecting) return;
    try {
      await reviewKyc(rejecting.id, false, reason || "Documents unclear or invalid");
      toast.success("KYC rejected");
      setRejecting(null);
      setReason("");
      load(tab);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reject failed");
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Real-money withdrawal identity verification. Documents: Aadhaar / PAN / Passport.
      </p>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full border px-4 py-1.5 text-xs transition ${
                tab === t.id
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-white/10 text-muted-foreground hover:border-gold/30"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => load(tab)}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-gold"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No {tab} KYC requests.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/5">
                  <IdCard className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {r.name} <span className="text-xs text-muted-foreground">@{r.username}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.document_type.toUpperCase()} · DOB {r.dob} · Submitted{" "}
                    {new Date(r.created_at).toLocaleDateString("en-IN")}
                  </div>
                  {r.status === "rejected" && r.rejection_reason && (
                    <div className="mt-1 text-xs text-rose-400">Reason: {r.rejection_reason}</div>
                  )}
                </div>
                {r.status === "pending" && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => approve(r.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => setRejecting(r)}
                      className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/20"
                    >
                      <ShieldX className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {rejecting && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => setRejecting(null)}
        >
          <Card className="w-full max-w-md p-6">
            <div onClick={(e) => e.stopPropagation()}>
              <h2 className="mb-3 font-display text-lg text-rose-400">
                Reject KYC — {rejecting.name}
              </h2>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (e.g. blurry document, name mismatch)…"
                className="mb-4 min-h-20 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-gold/50"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setRejecting(null)}
                  className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  className="flex-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/20"
                >
                  Confirm Reject
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
