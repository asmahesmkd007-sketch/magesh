import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Coins,
  TrendingUp,
  TrendingDown,
  Trophy,
  Crown,
  Sparkles,
  Star,
  Gift,
  ShieldCheck,
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet as WalletIcon,
  Lock,
  Landmark,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  X,
  BanknoteIcon,
  Settings,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  PageShell,
  Card,
  GoldButton,
  SectionTitle,
  GhostButton,
} from "@/components/site/Primitives";
import { useAuth } from "@/hooks/useAuth";
import { useWallet, useWalletTransactions } from "@/hooks/useWallet";
import { useBankDetails } from "@/hooks/useBankDetails";
import { lookupIfsc, isValidIfscFormat, type IfscDetails } from "@/lib/ifsc";
import { useWithdrawalRequests, submitWithdrawal, cancelWithdrawal } from "@/hooks/useWithdrawal";
import type { TransactionType } from "@/lib/api/walletClient";
import type { WithdrawalRequest } from "@/hooks/useWithdrawal";
import { noindexSeo } from "@/lib/seo";

import { RequireAuth } from "@/components/auth/RequireAuth";

export const Route = createFileRoute("/wallet")({
  head: () =>
    noindexSeo(
      "Wallet — ChessOx",
      "Your ChessOx wallet, withdrawals, and transaction history.",
      "noindex, nofollow",
    ),
  component: () => (
    <RequireAuth>
      <WalletPage />
    </RequireAuth>
  ),
});

// ── Transaction filter types ─────────────────────────────────────────
type FilterTab = "all" | "premium_bonus" | "tournament_entry" | "tournament_prize" | "admin";

const TAB_LABELS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "premium_bonus", label: "Premium" },
  { id: "tournament_entry", label: "Tournament Fees" },
  { id: "tournament_prize", label: "Prizes" },
  { id: "admin", label: "Admin" },
];

function typeMatchesFilter(type: TransactionType, filter: FilterTab): boolean {
  if (filter === "all") return true;
  if (filter === "admin") return type === "admin_credit" || type === "admin_debit";
  return type === filter;
}

// ── Helpers ──────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Status badge ─────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  rejected: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  cancelled: "border-white/20 bg-white/5 text-muted-foreground",
  approved: "border-blue-500/30 bg-blue-500/10 text-blue-400",
};

function StatusBadge({ status }: { status: string }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? ""}`}
    >
      {label}
    </span>
  );
}

// ── Transaction icon / badge ──────────────────────────────────────────
function TxIcon({ type }: { type: TransactionType }) {
  const cls = "h-4 w-4";
  switch (type) {
    case "premium_bonus":
      return <Sparkles className={`${cls} text-gold`} />;
    case "tournament_entry":
      return <Trophy className={`${cls} text-rose-400`} />;
    case "tournament_prize":
      return <Trophy className={`${cls} text-emerald-400`} />;
    case "admin_credit":
      return <ShieldCheck className={`${cls} text-emerald-400`} />;
    case "admin_debit":
      return <ShieldCheck className={`${cls} text-rose-400`} />;
    case "refund":
      return <ArrowDownLeft className={`${cls} text-blue-400`} />;
    case "welcome_bonus":
      return <Gift className={`${cls} text-gold`} />;
    default:
      return <Coins className={`${cls} text-muted-foreground`} />;
  }
}

function TxTypeBadge({ type }: { type: TransactionType }) {
  const map: Record<TransactionType, { label: string; cls: string }> = {
    premium_bonus: { label: "Premium Bonus", cls: "border-gold/30 bg-gold/10 text-gold" },
    tournament_entry: {
      label: "Entry Fee",
      cls: "border-rose-500/30 bg-rose-500/10 text-rose-400",
    },
    tournament_prize: { label: "Prize", cls: "border-emerald/30 bg-emerald/10 text-emerald" },
    admin_credit: { label: "Admin Credit", cls: "border-blue-500/30 bg-blue-500/10 text-blue-400" },
    admin_debit: {
      label: "Admin Debit",
      cls: "border-orange-500/30 bg-orange-500/10 text-orange-400",
    },
    refund: { label: "Refund", cls: "border-sky-500/30 bg-sky-500/10 text-sky-400" },
    tournament_refund: {
      label: "Tournament Refund",
      cls: "border-sky-500/30 bg-sky-500/10 text-sky-400",
    },
    welcome_bonus: { label: "Welcome Bonus", cls: "border-gold/30 bg-gold/10 text-gold" },
  };
  const { label, cls } = map[type] ?? { label: type, cls: "border-white/10 text-muted-foreground" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>
      {label}
    </span>
  );
}

// ── Masked account input ──────────────────────────────────────────────
function MaskedAccountInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const displayValue = value.length > 4 ? "X".repeat(value.length - 4) + value.slice(-4) : value;
  return (
    <div className="relative font-mono">
      <input
        type="text"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-transparent caret-foreground outline-none transition focus:border-gold/50 focus:ring-1 focus:ring-gold/50 disabled:opacity-50"
        placeholder="Enter account number"
        maxLength={20}
      />
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-4 text-foreground">
        {displayValue || <span className="text-muted-foreground/50">Enter account number</span>}
      </div>
    </div>
  );
}

// ── Bank Setup Modal ──────────────────────────────────────────────────

function BankSetupModal({ onSuccess }: { onSuccess: () => void }) {
  const { user } = useAuth();
  const { saveBankDetails } = useBankDetails(user?.id);

  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccount, setConfirmAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [accountType, setAccountType] = useState<"savings" | "current">("savings");
  const [ifscDetails, setIfscDetails] = useState<IfscDetails | null>(null);
  const [isVerifyingIfsc, setIsVerifyingIfsc] = useState(false);
  const [ifscError, setIfscError] = useState("");
  const [isOfflineOrError, setIsOfflineOrError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const accountsMatch = accountNumber && confirmAccount && accountNumber === confirmAccount;
  const accountsMismatch = confirmAccount.length > 0 && accountNumber !== confirmAccount;
  const canSave = accountName.length > 2 && accountsMatch && ifscDetails !== null && !isSaving;

  useEffect(() => {
    const code = ifsc.trim().toUpperCase();
    if (!code || code.length < 11) {
      setIfscDetails(null);
      setIfscError("");
      setIsOfflineOrError(false);
      return;
    }

    if (!isValidIfscFormat(code)) {
      setIfscDetails(null);
      setIfscError(
        "Invalid IFSC Code. Format must be 4 letters, '0', and 6 alphanumeric characters.",
      );
      setIsOfflineOrError(false);
      return;
    }

    const id = setTimeout(async () => {
      setIsVerifyingIfsc(true);
      setIfscError("");
      setIsOfflineOrError(false);

      const res = await lookupIfsc(code);

      if (res.success) {
        setIfscDetails(res.details);
        setIfscError("");
        setIsOfflineOrError(false);
      } else {
        setIfscDetails(null);
        setIfscError(res.error);
        setIsOfflineOrError(!!res.isOfflineOrError);
      }

      setIsVerifyingIfsc(false);
    }, 350);

    return () => clearTimeout(id);
  }, [ifsc]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || !ifscDetails) return;
    setIsSaving(true);
    const ok = await saveBankDetails({
      accountHolderName: accountName,
      accountNumber,
      ifscCode: ifsc.toUpperCase(),
      bankName: ifscDetails.BANK,
      branchName: ifscDetails.BRANCH,
      branchAddress: ifscDetails.ADDRESS,
      accountType,
    });
    setIsSaving(false);
    if (ok) onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gold/10 border border-gold/20">
            <Landmark className="h-8 w-8 text-gold" />
          </div>
          <h1 className="font-display text-3xl text-gradient-gold">Complete Bank Verification</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You must add a bank account before you can access withdrawals.
          </p>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-white/5 bg-white/[0.02] px-6 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4 text-gold" />
              Your details are encrypted with AES-256 and stored securely.
            </div>
          </div>

          <form onSubmit={handleSave} className="p-6 space-y-5">
            {/* Account holder name */}
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Account Holder Name
              </label>
              <input
                type="text"
                required
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 outline-none transition focus:border-gold/50 focus:ring-1 focus:ring-gold/50"
                placeholder="As it appears on your bank statement"
              />
            </div>

            {/* Account number */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">
                    Account Number
                  </label>
                  <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                </div>
                <MaskedAccountInput value={accountNumber} onChange={setAccountNumber} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-widest text-muted-foreground">
                  Re-enter Account Number
                </label>
                <input
                  type="text"
                  required
                  value={confirmAccount}
                  onChange={(e) => setConfirmAccount(e.target.value.replace(/\D/g, ""))}
                  onPaste={(e) => e.preventDefault()}
                  className={`w-full rounded-lg border bg-white/5 px-4 py-2.5 outline-none transition font-mono ${
                    accountsMismatch
                      ? "border-rose-500/50 focus:border-rose-500"
                      : "border-white/10 focus:border-gold/50 focus:ring-1 focus:ring-gold/50"
                  }`}
                  placeholder="Verify account number"
                  maxLength={20}
                />
                {accountsMatch && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Numbers match
                  </div>
                )}
                {accountsMismatch && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-400">
                    <XCircle className="h-3.5 w-3.5" /> Numbers do not match
                  </div>
                )}
              </div>
            </div>

            {/* IFSC + Account Type */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-widest text-muted-foreground">
                  IFSC Code
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={ifsc}
                    onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                    className={`w-full uppercase rounded-lg border bg-white/5 px-4 py-2.5 outline-none transition font-mono ${
                      ifscError
                        ? "border-rose-500/50"
                        : "border-white/10 focus:border-gold/50 focus:ring-1 focus:ring-gold/50"
                    }`}
                    placeholder="e.g. SBIN0001234"
                    maxLength={11}
                  />
                  {isVerifyingIfsc && (
                    <div className="absolute right-3 top-3">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                {ifscError && (
                  <div
                    className={`flex items-center gap-1.5 text-xs ${isOfflineOrError ? "text-amber-400" : "text-rose-400"}`}
                  >
                    {isOfflineOrError ? (
                      <AlertCircle className="h-3.5 w-3.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}{" "}
                    {ifscError}
                  </div>
                )}
                {ifscDetails && !isVerifyingIfsc && (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-xs text-emerald-400 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> {ifscDetails.BANK} —{" "}
                      {ifscDetails.BRANCH}
                    </div>
                    {(ifscDetails.CITY || ifscDetails.DISTRICT || ifscDetails.STATE) && (
                      <div className="text-[11px] text-emerald-300/80 pl-5">
                        {[ifscDetails.CITY, ifscDetails.DISTRICT, ifscDetails.STATE]
                          .filter((val, idx, arr) => val && arr.indexOf(val) === idx)
                          .join(", ")}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-widest text-muted-foreground">
                  Account Type
                </label>
                <div className="flex gap-5 pt-2.5">
                  {(["savings", "current"] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="accountTypeBankModal"
                        value={t}
                        checked={accountType === t}
                        onChange={() => setAccountType(t)}
                        className="accent-gold"
                      />
                      <span className="text-sm capitalize">{t}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 flex gap-3 justify-end">
              <GoldButton type="submit" disabled={!canSave} className="px-8">
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  "Verify & Save Bank Account"
                )}
              </GoldButton>
            </div>
          </form>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          You can edit your bank details later from{" "}
          <Link to="/settings" className="text-gold hover:underline">
            Settings → Bank Account
          </Link>
        </p>
      </div>
    </div>
  );
}

// ── Withdrawal Form ───────────────────────────────────────────────────
function WithdrawalForm({
  balance,
  lockedBalance,
  pendingRequest,
  onSubmitSuccess,
  onCancelSuccess,
}: {
  balance: number;
  lockedBalance: number;
  pendingRequest: WithdrawalRequest | null;
  onSubmitSuccess: () => void;
  onCancelSuccess: () => void;
}) {
  const withdrawable = Math.max(0, balance - 10);
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState("");

  const numAmount = parseInt(amount, 10);
  const amountValid = !isNaN(numAmount) && numAmount >= 10 && numAmount <= withdrawable;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!amountValid) {
      setError(`Enter an amount between ₹10 and ₹${withdrawable}`);
      return;
    }
    setIsSubmitting(true);
    const id = await submitWithdrawal(numAmount);
    setIsSubmitting(false);
    if (id) {
      setAmount("");
      onSubmitSuccess();
    }
  }

  async function handleCancel() {
    if (!pendingRequest) return;
    setIsCancelling(true);
    const ok = await cancelWithdrawal(pendingRequest.id);
    setIsCancelling(false);
    if (ok) onCancelSuccess();
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-white/5 bg-white/[0.02] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BanknoteIcon className="h-5 w-5 text-gold" />
          <h2 className="font-display text-xl">Withdraw Funds</h2>
        </div>
      </div>

      <div className="p-6">
        {/* Balance summary */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
              Wallet Balance
            </div>
            <div className="font-display text-2xl text-foreground">₹{balance}</div>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
            <div className="text-[11px] uppercase tracking-widest text-amber-400/70 mb-1">
              Locked
            </div>
            <div className="font-display text-2xl text-amber-400">₹{lockedBalance}</div>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
            <div className="text-[11px] uppercase tracking-widest text-emerald-400/70 mb-1">
              Withdrawable
            </div>
            <div className="font-display text-2xl text-emerald-400">₹{withdrawable}</div>
          </div>
        </div>

        <p className="mb-5 text-xs text-muted-foreground flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />A minimum balance of ₹10 must always
          remain in your wallet. Minimum withdrawal is ₹10.
        </p>

        {/* Pending request */}
        {pendingRequest ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-medium text-amber-400">
                    Pending Withdrawal Request
                  </span>
                </div>
                <div className="font-display text-3xl text-amber-400 mt-2">
                  ₹{pendingRequest.amount}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Submitted {fmtDate(pendingRequest.created_at)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground font-mono">
                  ID: {pendingRequest.id.slice(0, 8).toUpperCase()}
                </div>
              </div>
              <button
                onClick={handleCancel}
                disabled={isCancelling}
                className="shrink-0 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/20 transition disabled:opacity-50"
              >
                {isCancelling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                Cancel Request
              </button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Your funds are locked until this request is processed by our admin team. Cancelling
              will immediately return the amount to your wallet.
            </p>
          </div>
        ) : withdrawable < 10 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 text-center">
            <WalletIcon className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              You need at least ₹20 in your wallet to make a withdrawal.
            </p>
            <Link to="/premium" className="mt-4 inline-block">
              <GoldButton>
                <Crown className="h-4 w-4 mr-2" /> Add Funds via Premium
              </GoldButton>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">
                Withdrawal Amount (₹)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-display text-lg">
                  ₹
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError("");
                  }}
                  className={`w-full rounded-lg border bg-white/5 pl-8 pr-4 py-3 text-lg font-display outline-none transition ${
                    error
                      ? "border-rose-500/50 focus:border-rose-500"
                      : "border-white/10 focus:border-gold/50 focus:ring-1 focus:ring-gold/50"
                  }`}
                  placeholder="Enter amount"
                  min={10}
                  max={withdrawable}
                />
              </div>
              {error && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-400">
                  <XCircle className="h-3.5 w-3.5" /> {error}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {[50, 100, 200, 500]
                  .filter((v) => v <= withdrawable)
                  .map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        setAmount(String(v));
                        setError("");
                      }}
                      className="rounded-full border border-gold/20 bg-gold/5 px-3 py-1 text-xs text-gold hover:bg-gold/10 transition"
                    >
                      ₹{v}
                    </button>
                  ))}
                {withdrawable > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAmount(String(withdrawable));
                      setError("");
                    }}
                    className="rounded-full border border-gold/20 bg-gold/5 px-3 py-1 text-xs text-gold hover:bg-gold/10 transition"
                  >
                    Max ₹{withdrawable}
                  </button>
                )}
              </div>
            </div>

            <GoldButton
              type="submit"
              disabled={!amountValid || isSubmitting}
              className="w-full py-3"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
                </>
              ) : (
                <>
                  <BanknoteIcon className="mr-2 h-4 w-4" /> Request Withdrawal of ₹{numAmount || 0}
                </>
              )}
            </GoldButton>

            <p className="text-xs text-muted-foreground text-center">
              Withdrawals are reviewed by our admin team and processed within 2–4 business days.
            </p>
          </form>
        )}
      </div>
    </Card>
  );
}

// ── Bank Status Card ──────────────────────────────────────────────────
function BankStatusCard({
  bankAccount,
}: {
  bankAccount: NonNullable<ReturnType<typeof useBankDetails>["bankAccount"]>;
}) {
  const maskedNumber = "XXXXXXXX" + bankAccount.account_number_last4;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              Bank Verified
              <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                ✓ Active
              </span>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{bankAccount.bank_name}</div>
            <div className="mt-1 font-mono text-sm text-foreground">{maskedNumber}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              IFSC: {bankAccount.ifsc_code} ·{" "}
              {bankAccount.account_type === "savings" ? "Savings" : "Current"} Account
            </div>
          </div>
        </div>
        <Link to="/settings">
          <GhostButton className="shrink-0 px-3 py-2 text-xs">
            <Settings className="h-3.5 w-3.5 mr-1" /> Edit
          </GhostButton>
        </Link>
      </div>
    </Card>
  );
}

// ── Withdrawal History ────────────────────────────────────────────────
function WithdrawalHistory({
  requests,
}: {
  requests: ReturnType<typeof useWithdrawalRequests>["requests"];
}) {
  if (requests.length === 0) return null;

  return (
    <div className="mt-8">
      <SectionTitle kicker="History" title="Withdrawal Requests" />
      <Card className="overflow-hidden">
        <div className="divide-y divide-white/5">
          {requests.map((req) => (
            <div
              key={req.id}
              className="flex items-center gap-4 px-5 py-4 transition hover:bg-white/[0.02]"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/5">
                <BanknoteIcon className="h-4 w-4 text-gold" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Withdrawal Request</span>
                  <StatusBadge status={req.status} />
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {fmtDate(req.created_at)}
                  {req.processed_at && ` · Processed ${fmtDate(req.processed_at)}`}
                </div>
                {req.reject_reason && (
                  <div className="mt-1 text-xs text-rose-400">Reason: {req.reject_reason}</div>
                )}
              </div>
              <div className="shrink-0 font-display text-lg text-rose-400">
                <ArrowUpRight className="inline h-4 w-4" /> ₹{req.amount}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Main Wallet Page ──────────────────────────────────────────────────
function WalletPage() {
  const { user, loading: authLoading } = useAuth();
  const { wallet, loading: walletLoading, refetch: refetchWallet } = useWallet(user?.id);
  const { transactions, loading: txLoading } = useWalletTransactions(user?.id, 100);
  const { bankAccount, loading: bankLoading } = useBankDetails(user?.id);
  const {
    requests: withdrawalRequests,
    loading: wdLoading,
    refetch: refetchWithdrawals,
  } = useWithdrawalRequests(user?.id);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [showBankModal, setShowBankModal] = useState(false);

  // Show bank modal once loading is done and no bank account
  useEffect(() => {
    if (!bankLoading && !walletLoading && bankAccount === null && user) {
      setShowBankModal(true);
    }
  }, [bankLoading, walletLoading, bankAccount, user]);

  if (authLoading || walletLoading) {
    return (
      <PageShell eyebrow="Royal Treasury" title="Wallet">
        <div className="grid place-items-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      </PageShell>
    );
  }

  if (!user) {
    return (
      <PageShell eyebrow="Royal Treasury" title="Wallet">
        <Card className="p-10 text-center">
          <WalletIcon className="mx-auto h-12 w-12 text-gold/40" />
          <p className="mt-4 text-muted-foreground">Sign in to view your wallet.</p>
          <div className="mt-6">
            <Link to="/auth">
              <GoldButton>Sign in</GoldButton>
            </Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  const balance = wallet?.balance ?? 0;
  const lockedBalance = wallet?.locked_balance ?? 0;
  const withdrawable = Math.max(0, balance - 10);
  const filteredTx = transactions.filter((tx) => typeMatchesFilter(tx.type, filter));
  const premiumEarned = transactions
    .filter((tx) => tx.type === "premium_bonus" || tx.type === "welcome_bonus")
    .reduce((s, t) => s + t.amount, 0);
  const prizesEarned = transactions
    .filter((tx) => tx.type === "tournament_prize")
    .reduce((s, t) => s + t.amount, 0);
  const feesSpent = transactions
    .filter((tx) => tx.type === "tournament_entry")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const pendingRequest = withdrawalRequests.find((r) => r.status === "pending") ?? null;

  return (
    <>
      {/* Bank setup modal */}
      {showBankModal && (
        <BankSetupModal
          onSuccess={() => {
            setShowBankModal(false);
            // useBankDetails will re-fetch via the hook, but we can trigger it by reloading
            window.location.reload();
          }}
        />
      )}

      <PageShell
        eyebrow="Royal Treasury"
        title="My Wallet"
        subtitle="Your balance, withdrawals, and transaction history."
      >
        {/* ── Balance Hero ── */}
        <Card className="relative overflow-hidden p-8">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-gold/10 via-transparent to-transparent" />
          <div className="pointer-events-none absolute inset-0 mandala-bg opacity-20" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-gold/70">
                Current Balance
              </div>
              <div className="mt-2 flex items-end gap-3">
                <span className="font-display text-6xl text-gradient-gold">{balance}</span>
                <span className="mb-2 flex items-center gap-1 text-lg text-gold/80">
                  <Coins className="h-5 w-5" /> Coins
                </span>
              </div>

              {/* Locked / Withdrawable chips */}
              <div className="mt-3 flex flex-wrap gap-3">
                {lockedBalance > 0 && (
                  <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
                    <Lock className="h-3 w-3" /> ₹{lockedBalance} locked
                  </div>
                )}
                <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
                  <BanknoteIcon className="h-3 w-3" /> ₹{withdrawable} withdrawable
                </div>
                {bankAccount && (
                  <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
                    <ShieldCheck className="h-3 w-3" /> Bank Verified
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  if (!bankAccount) {
                    setShowBankModal(true);
                  } else {
                    document
                      .getElementById("withdrawal-section")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
                className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-400 hover:bg-emerald-500/15 transition"
              >
                <BanknoteIcon className="h-4 w-4" /> Withdraw Funds
              </button>
              <Link to="/premium">
                <GoldButton className="w-full">
                  <Crown className="h-4 w-4" /> Get More Coins
                </GoldButton>
              </Link>
            </div>
          </div>
        </Card>

        {/* ── Stats Row ── */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            {
              label: "Total Earned",
              value: wallet?.total_earned ?? 0,
              icon: TrendingUp,
              cls: "text-emerald-400",
            },
            {
              label: "Total Spent",
              value: wallet?.total_spent ?? 0,
              icon: TrendingDown,
              cls: "text-rose-400",
            },
            { label: "Premium Bonuses", value: premiumEarned, icon: Star, cls: "text-gold" },
            { label: "Prize Winnings", value: prizesEarned, icon: Trophy, cls: "text-emerald-400" },
          ].map(({ label, value, icon: Icon, cls }) => (
            <Card key={label} className="p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                <Icon className={`h-3.5 w-3.5 ${cls}`} /> {label}
              </div>
              <div className={`mt-2 font-display text-3xl ${cls}`}>{value}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">coins</div>
            </Card>
          ))}
        </div>

        {/* ── Bank Status ── */}
        {bankAccount && (
          <div className="mt-6">
            <BankStatusCard bankAccount={bankAccount} />
          </div>
        )}

        {/* ── Withdrawal Section ── */}
        {bankAccount && !wdLoading && (
          <div id="withdrawal-section" className="mt-6">
            <WithdrawalForm
              balance={balance}
              lockedBalance={lockedBalance}
              pendingRequest={pendingRequest}
              onSubmitSuccess={() => {
                refetchWallet();
                refetchWithdrawals();
              }}
              onCancelSuccess={() => {
                refetchWallet();
                refetchWithdrawals();
              }}
            />
          </div>
        )}

        {/* ── Withdrawal History ── */}
        {withdrawalRequests.length > 0 && <WithdrawalHistory requests={withdrawalRequests} />}

        {/* ── Quick Stats Summary ── */}
        {feesSpent > 0 && (
          <Card className="mt-6 flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-rose-500/10">
                <Trophy className="h-5 w-5 text-rose-400" />
              </span>
              <div>
                <div className="text-sm font-medium">Tournament Entries</div>
                <div className="text-xs text-muted-foreground">
                  {transactions.filter((t) => t.type === "tournament_entry").length} tournaments
                  joined · {feesSpent} coins spent
                </div>
              </div>
            </div>
            <Link to="/tournaments" className="text-sm text-gold hover:underline">
              Browse Tournaments →
            </Link>
          </Card>
        )}

        {/* ── Transaction History ── */}
        <div className="mt-8">
          <SectionTitle kicker="Ledger" title="Transaction History" />

          <div className="mb-4 flex flex-wrap gap-2">
            {TAB_LABELS.map(({ id, label }) => (
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
              </button>
            ))}
          </div>

          <Card className="overflow-hidden">
            {txLoading ? (
              <div className="grid place-items-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gold" />
              </div>
            ) : filteredTx.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                {filter === "all"
                  ? "No transactions yet."
                  : `No ${TAB_LABELS.find((t) => t.id === filter)?.label.toLowerCase()} transactions yet.`}
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {filteredTx.map((tx) => {
                  const isCredit = tx.amount > 0;
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-4 px-5 py-4 transition hover:bg-white/[0.02]"
                    >
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/5">
                        <TxIcon type={tx.type} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{tx.description}</span>
                          <TxTypeBadge type={tx.type} />
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {fmtDate(tx.created_at)} · Balance after: {tx.balance_after} coins
                        </div>
                      </div>
                      <div
                        className={`flex shrink-0 items-center gap-1 font-display text-lg ${isCredit ? "text-emerald-400" : "text-rose-400"}`}
                      >
                        {isCredit ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                        {isCredit ? "+" : ""}
                        {tx.amount}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </PageShell>
    </>
  );
}
