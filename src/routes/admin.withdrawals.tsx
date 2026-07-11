import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  BanknoteIcon,
  User,
  AlertCircle,
  Filter,
  RefreshCw,
  ChevronDown,
  Lock,
} from "lucide-react";
import { Card, GoldButton, SectionTitle } from "@/components/site/Primitives";
import { AdminShell } from "@/components/site/AdminShell";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  adminApproveWithdrawal,
  adminRejectWithdrawal,
  adminGetWithdrawals,
  type AdminWithdrawalRequest,
  type WithdrawalStatus,
} from "@/hooks/useWithdrawal";

export const Route = createFileRoute("/admin/withdrawals")({
  head: () => ({
    meta: [{ title: "Admin — Withdrawals — ChessOx" }],
  }),
  component: AdminWithdrawalsPage,
});

// ── Helpers ───────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_STYLES: Record<string, { cls: string; icon: React.ReactNode }> = {
  pending: {
    cls: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  completed: {
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  rejected: {
    cls: "border-rose-500/30 bg-rose-500/10 text-rose-400",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
  cancelled: {
    cls: "border-white/20 bg-white/5 text-muted-foreground",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? {
    cls: "border-white/20 bg-white/5 text-muted-foreground",
    icon: null,
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.cls}`}
    >
      {s.icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── Reject modal ──────────────────────────────────────────────────────
function RejectModal({
  request,
  onConfirm,
  onCancel,
}: {
  request: AdminWithdrawalRequest;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    onConfirm(reason.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
      <Card className="w-full max-w-md p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-500/10">
            <XCircle className="h-5 w-5 text-rose-400" />
          </div>
          <div>
            <h2 className="font-display text-xl text-rose-400">Reject Withdrawal</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This will return ₹{request.amount} to {request.full_name}'s wallet.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">
              Rejection Reason (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Suspicious activity, incorrect bank details…"
              className="w-full min-h-20 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition focus:border-gold/50 focus:ring-1 focus:ring-gold/50 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onCancel}
              className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={busy}
              className="flex-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Reject & Refund
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Withdrawal Row ────────────────────────────────────────────────────
function WithdrawalRow({
  req,
  onActionDone,
}: {
  req: AdminWithdrawalRequest;
  onActionDone: () => void;
}) {
  const [isApproving, setIsApproving] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleApprove() {
    setIsApproving(true);
    const ok = await adminApproveWithdrawal(req.id);
    setIsApproving(false);
    if (ok) onActionDone();
  }

  async function handleRejectConfirm(reason: string) {
    setShowRejectModal(false);
    const ok = await adminRejectWithdrawal(req.id, reason || undefined);
    if (ok) onActionDone();
  }

  return (
    <>
      {showRejectModal && (
        <RejectModal
          request={req}
          onConfirm={handleRejectConfirm}
          onCancel={() => setShowRejectModal(false)}
        />
      )}
      <div className="border-b border-white/5 last:border-0">
        {/* Main row */}
        <div
          className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition"
          onClick={() => setExpanded((v) => !v)}
        >
          {/* User info */}
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/5">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{req.full_name}</span>
              <span className="text-xs text-muted-foreground">@{req.username}</span>
              <StatusBadge status={req.status} />
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {fmtDate(req.created_at)} · {req.bank_name} ···{req.account_last4}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div className="font-display text-xl text-foreground">₹{req.amount}</div>
            <div className="text-xs text-muted-foreground font-mono">
              #{req.id.slice(0, 8).toUpperCase()}
            </div>
          </div>

          <ChevronDown
            className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="px-5 pb-5 pt-0">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-5">
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
                    User ID
                  </div>
                  <div className="font-mono text-xs text-foreground break-all">{req.user_id}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
                    Bank Name
                  </div>
                  <div className="text-sm text-foreground">{req.bank_name}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
                    Account Number
                  </div>
                  <div className="font-mono text-sm text-foreground">
                    XXXXXXXX{req.account_last4}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
                    IFSC Code
                  </div>
                  <div className="font-mono text-sm text-foreground">{req.ifsc_code}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
                    Requested On
                  </div>
                  <div className="text-sm text-foreground">{fmtDate(req.created_at)}</div>
                </div>
                {req.processed_at && (
                  <div>
                    <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
                      Processed On
                    </div>
                    <div className="text-sm text-foreground">{fmtDate(req.processed_at)}</div>
                  </div>
                )}
                {req.reject_reason && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <div className="text-[11px] uppercase tracking-widest text-rose-400/70 mb-1">
                      Rejection Reason
                    </div>
                    <div className="text-sm text-rose-400">{req.reject_reason}</div>
                  </div>
                )}
              </div>

              {/* Action buttons — only for pending */}
              {req.status === "pending" && (
                <div className="flex flex-wrap gap-3 pt-4 border-t border-white/10">
                  <div className="flex-1 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
                    <div className="font-medium mb-1">Before approving:</div>
                    <ul className="text-xs space-y-0.5 list-disc pl-4 text-amber-400/80">
                      <li>Verify the user's identity</li>
                      <li>
                        Transfer ₹{req.amount} to {req.bank_name} ···{req.account_last4}
                      </li>
                      <li>IFSC: {req.ifsc_code}</li>
                      <li>Then click Approve to confirm transfer</li>
                    </ul>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={handleApprove}
                      disabled={isApproving}
                      className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 text-sm text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-50"
                    >
                      {isApproving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Approve (Mark Transferred)
                    </button>
                    <button
                      onClick={() => setShowRejectModal(true)}
                      className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-2.5 text-sm text-rose-400 hover:bg-rose-500/20 transition"
                    >
                      <XCircle className="h-4 w-4" /> Reject & Refund
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main Admin Withdrawals Page ───────────────────────────────────────
type StatusFilter = "all" | WithdrawalStatus;

const FILTER_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "completed", label: "Completed" },
  { id: "rejected", label: "Rejected" },
  { id: "cancelled", label: "Cancelled" },
];

function AdminWithdrawalsPage() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id);
  const [requests, setRequests] = useState<AdminWithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adminGetWithdrawals(
        filter === "all" ? undefined : (filter as WithdrawalStatus),
      );
      setRequests(data);
    } catch {
      // error handled in hook
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    load();
  }, [isAdmin, filter, load]);

  function handleRefresh() {
    setIsRefreshing(true);
    load();
  }

  const pending = requests.filter((r) => r.status === "pending").length;
  const completed = requests.filter((r) => r.status === "completed").length;
  const rejected = requests.filter((r) => r.status === "rejected").length;
  const totalAmt = requests.reduce((s, r) => s + (r.status === "pending" ? r.amount : 0), 0);

  return (
    <AdminShell title="Withdrawal Management">
      {/* ── Admin notice ── */}
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-gold/20 bg-gold/5 px-5 py-4">
        <ShieldCheck className="h-5 w-5 text-gold shrink-0" />
        <div className="text-sm text-gold/90">
          <strong>Admin Panel</strong> — Only admins can view this page. All actions are logged in
          the audit trail.
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
        {[
          { label: "Pending", value: pending, cls: "text-amber-400" },
          { label: "Completed", value: completed, cls: "text-emerald-400" },
          { label: "Rejected", value: rejected, cls: "text-rose-400" },
          { label: "Pending Amount", value: `₹${totalAmt}`, cls: "text-gold" },
        ].map(({ label, value, cls }) => (
          <Card key={label} className="p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              {label}
            </div>
            <div className={`font-display text-3xl ${cls}`}>{value}</div>
          </Card>
        ))}
      </div>

      {/* ── Requests table ── */}
      <SectionTitle kicker="Requests" title="Withdrawal Requests" />

      {/* Filter + refresh */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTER_TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`rounded-full border px-4 py-1.5 text-xs transition ${
                filter === id
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-white/10 text-muted-foreground hover:border-gold/30"
              }`}
            >
              {label}
              {id === "pending" && pending > 0 && (
                <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-background">
                  {pending}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-1.5 text-xs text-muted-foreground hover:border-gold/30 hover:text-gold transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="grid place-items-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : requests.length === 0 ? (
          <div className="py-20 text-center">
            <BanknoteIcon className="mx-auto h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">
              No {filter !== "all" ? filter : ""} withdrawal requests found.
            </p>
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-white/5 bg-white/[0.02] px-5 py-3">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                User / Bank
              </div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Amount
              </div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Status
              </div>
              <div className="w-6" />
            </div>
            {requests.map((req) => (
              <WithdrawalRow key={req.id} req={req} onActionDone={load} />
            ))}
          </div>
        )}
      </Card>

      {/* ── Instructions ── */}
      <Card className="mt-6 p-6 bg-white/[0.01]">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium mb-2">Admin Instructions</div>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-4">
              <li>Click a request row to expand it and see full bank details.</li>
              <li>
                Manually transfer the exact amount to the user's bank account outside this system.
              </li>
              <li>
                Only after the bank transfer is confirmed, click{" "}
                <strong className="text-foreground">Approve</strong> to mark it as completed.
              </li>
              <li>
                If the request cannot be processed, click{" "}
                <strong className="text-foreground">Reject</strong> — the amount will be
                automatically returned to the user's wallet.
              </li>
              <li>All actions are recorded in the admin audit log.</li>
            </ol>
          </div>
        </div>
      </Card>
    </AdminShell>
  );
}
