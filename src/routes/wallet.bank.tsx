import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  Building2,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Landmark,
  Lock,
  ArrowLeft,
} from "lucide-react";
import {
  PageShell,
  Card,
  GoldButton,
  SectionTitle,
  GhostButton,
} from "@/components/site/Primitives";
import { useAuth } from "@/hooks/useAuth";
import { useBankDetails } from "@/hooks/useBankDetails";
import { toast } from "sonner";

export const Route = createFileRoute("/wallet/bank")({
  head: () => ({
    meta: [{ title: "Bank Details — ChessOx" }],
  }),
  component: BankDetailsPage,
});

type IfscDetails = {
  BANK: string;
  BRANCH: string;
  ADDRESS: string;
  STATE: string;
  DISTRICT: string;
};

// Custom input that masks all but last 4 characters using a transparent input overlay trick
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
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} // only numbers
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

function BankDetailsPage() {
  const { user } = useAuth();
  const { bankAccount, loading: bankLoading, saveBankDetails } = useBankDetails(user?.id);
  const navigate = useNavigate();

  // Form State
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccount, setConfirmAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [accountType, setAccountType] = useState<"savings" | "current">("savings");

  // IFSC Verification State
  const [ifscDetails, setIfscDetails] = useState<IfscDetails | null>(null);
  const [isVerifyingIfsc, setIsVerifyingIfsc] = useState(false);
  const [ifscError, setIfscError] = useState("");

  // Submission state
  const [isSaving, setIsSaving] = useState(false);

  // Validation
  const accountsMatch = accountNumber && confirmAccount && accountNumber === confirmAccount;
  const accountsMismatch = confirmAccount.length > 0 && accountNumber !== confirmAccount;

  const canSave = accountName.length > 2 && accountsMatch && ifscDetails !== null && !isSaving;

  // Pre-fill if bank account exists
  useEffect(() => {
    if (bankAccount) {
      setAccountName(bankAccount.account_holder_name);
      setIfsc(bankAccount.ifsc_code);
      setAccountType(bankAccount.account_type);
      setIfscDetails({
        BANK: bankAccount.bank_name,
        BRANCH: bankAccount.branch_name,
        ADDRESS: bankAccount.branch_address,
        STATE: "",
        DISTRICT: "",
      });
      // We don't pre-fill account number, they must enter it again to update
    }
  }, [bankAccount]);

  // Debounced IFSC Lookup
  useEffect(() => {
    const code = ifsc.trim().toUpperCase();
    if (code.length !== 11) {
      setIfscDetails(null);
      setIfscError("");
      return;
    }

    // Skip fetch if it's already the saved one
    if (bankAccount && code === bankAccount.ifsc_code && !ifscDetails?.STATE) {
      // It's the loaded one, keep it as is unless they change it
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsVerifyingIfsc(true);
      setIfscError("");
      try {
        const res = await fetch(`https://ifsc.razorpay.com/${code}`);
        if (!res.ok) {
          throw new Error("Invalid IFSC Code");
        }
        const data = await res.json();
        setIfscDetails(data);
      } catch (err) {
        setIfscDetails(null);
        setIfscError("Invalid IFSC Code. Please check and try again.");
      } finally {
        setIsVerifyingIfsc(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [ifsc, bankAccount]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || !ifscDetails) return;

    setIsSaving(true);
    const success = await saveBankDetails({
      accountHolderName: accountName,
      accountNumber: accountNumber,
      ifscCode: ifsc.toUpperCase(),
      bankName: ifscDetails.BANK,
      branchName: ifscDetails.BRANCH,
      branchAddress: ifscDetails.ADDRESS,
      accountType,
    });
    setIsSaving(false);

    if (success) {
      navigate({ to: "/wallet" });
    }
  };

  if (bankLoading) {
    return (
      <PageShell>
        <div className="grid place-items-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Withdrawals"
      title="Bank Details"
      subtitle="Link your bank account to withdraw your tournament winnings."
    >
      <div className="mb-6 flex">
        <Link to="/wallet">
          <GhostButton className="px-3">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Wallet
          </GhostButton>
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Form Column */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="border-b border-white/5 bg-white/[0.02] px-6 py-4">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-gold" />
                <h2 className="font-display text-xl">Account Information</h2>
              </div>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-6">
              {/* Account Holder Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
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

              {/* Account Numbers */}
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-muted-foreground">
                      Account Number
                    </label>
                    <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </div>
                  <MaskedAccountInput value={accountNumber} onChange={setAccountNumber} />
                  <p className="text-[11px] text-muted-foreground">
                    Secured with AES-256 encryption
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
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
                        ? "border-rose-500/50 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                        : "border-white/10 focus:border-gold/50 focus:ring-1 focus:ring-gold/50"
                    }`}
                    placeholder="Verify account number"
                    maxLength={20}
                  />
                  {accountsMatch && accountNumber.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Account numbers match
                    </div>
                  )}
                  {accountsMismatch && (
                    <div className="flex items-center gap-1.5 text-xs text-rose-400">
                      <XCircle className="h-3.5 w-3.5" /> Account numbers do not match
                    </div>
                  )}
                </div>
              </div>

              {/* IFSC and Account Type */}
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">IFSC Code</label>
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
                    <div className="flex items-center gap-1.5 text-xs text-rose-400">
                      <XCircle className="h-3.5 w-3.5" /> {ifscError}
                    </div>
                  )}
                  {ifscDetails && !isVerifyingIfsc && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <ShieldCheck className="h-3.5 w-3.5" /> IFSC Verified
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Account Type</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="accountType"
                        value="savings"
                        checked={accountType === "savings"}
                        onChange={() => setAccountType("savings")}
                        className="accent-gold"
                      />
                      <span className="text-sm">Savings</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="accountType"
                        value="current"
                        checked={accountType === "current"}
                        onChange={() => setAccountType("current")}
                        className="accent-gold"
                      />
                      <span className="text-sm">Current</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4 flex items-center justify-between border-t border-white/10">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Encrypted and stored securely
                </p>
                <GoldButton type="submit" disabled={!canSave} className="px-8">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                    </>
                  ) : bankAccount ? (
                    "Update Bank Details"
                  ) : (
                    "Save Bank Details"
                  )}
                </GoldButton>
              </div>
            </form>
          </Card>
        </div>

        {/* Info Column */}
        <div className="space-y-6">
          {bankAccount?.verification_status === "verified" && (
            <Card className="border-emerald-500/30 bg-emerald-500/10 p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <h3 className="font-display text-emerald-400">Bank Account Verified</h3>
                  <p className="mt-1 text-xs text-emerald-400/80">
                    Your bank account is verified and ready for withdrawals.
                  </p>
                  <div className="mt-3 rounded bg-black/20 p-2.5 font-mono text-sm text-emerald-100">
                    XXXX-XXXX-XXXX-{bankAccount.account_number_last4}
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-5 bg-white/[0.01]">
            <h3 className="font-display text-sm text-muted-foreground flex items-center gap-2 mb-4">
              <Building2 className="h-4 w-4" /> Bank Information
            </h3>

            {ifscDetails ? (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Bank</div>
                  <div className="font-medium">{ifscDetails.BANK}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Branch</div>
                  <div className="font-medium">{ifscDetails.BRANCH}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Address</div>
                  <div className="text-muted-foreground leading-relaxed">{ifscDetails.ADDRESS}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground flex flex-col items-center justify-center py-6 text-center opacity-60">
                <Building2 className="h-8 w-8 mb-2 opacity-20" />
                <p>Enter your IFSC code to automatically fetch your bank details.</p>
              </div>
            )}
          </Card>

          <Card className="p-5 bg-white/[0.01]">
            <h3 className="font-display text-sm text-muted-foreground flex items-center gap-2 mb-3">
              <AlertCircle className="h-4 w-4" /> Important Note
            </h3>
            <ul className="text-xs text-muted-foreground space-y-2 list-disc pl-4">
              <li>
                Ensure the account holder name exactly matches your bank records to avoid withdrawal
                rejections.
              </li>
              <li>Withdrawals usually take 2-4 business days to process.</li>
              <li>ChessOX does not charge any hidden fees for withdrawals.</li>
            </ul>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
