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
} from "lucide-react";
import { useState } from "react";
import { PageShell, Card, GoldButton, SectionTitle } from "@/components/site/Primitives";
import { useAuth } from "@/hooks/useAuth";
import { useWallet, useWalletTransactions } from "@/hooks/useWallet";
import type { TransactionType } from "@/lib/api/walletClient";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — ChessOx" },
      { name: "description", content: "Your ChessOx coin balance and transaction history." },
    ],
  }),
  component: WalletPage,
});

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

function TxIcon({ type }: { type: TransactionType }) {
  const iconClass = "h-4 w-4";
  switch (type) {
    case "premium_bonus":
      return <Sparkles className={`${iconClass} text-gold`} />;
    case "tournament_entry":
      return <Trophy className={`${iconClass} text-rose-400`} />;
    case "tournament_prize":
      return <Trophy className={`${iconClass} text-emerald-400`} />;
    case "admin_credit":
      return <ShieldCheck className={`${iconClass} text-emerald-400`} />;
    case "admin_debit":
      return <ShieldCheck className={`${iconClass} text-rose-400`} />;
    case "refund":
      return <ArrowDownLeft className={`${iconClass} text-blue-400`} />;
    case "welcome_bonus":
      return <Gift className={`${iconClass} text-gold`} />;
    default:
      return <Coins className={`${iconClass} text-muted-foreground`} />;
  }
}

function TxTypeBadge({ type }: { type: TransactionType }) {
  const map: Record<TransactionType, { label: string; cls: string }> = {
    premium_bonus:    { label: "Premium Bonus",  cls: "border-gold/30 bg-gold/10 text-gold" },
    tournament_entry: { label: "Entry Fee",       cls: "border-rose-500/30 bg-rose-500/10 text-rose-400" },
    tournament_prize: { label: "Prize",            cls: "border-emerald/30 bg-emerald/10 text-emerald" },
    admin_credit:     { label: "Admin Credit",    cls: "border-blue-500/30 bg-blue-500/10 text-blue-400" },
    admin_debit:      { label: "Admin Debit",     cls: "border-orange-500/30 bg-orange-500/10 text-orange-400" },
    refund:           { label: "Refund",           cls: "border-sky-500/30 bg-sky-500/10 text-sky-400" },
    welcome_bonus:    { label: "Welcome Bonus",   cls: "border-gold/30 bg-gold/10 text-gold" },
  };
  const { label, cls } = map[type] ?? { label: type, cls: "border-white/10 text-muted-foreground" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>
      {label}
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function WalletPage() {
  const { user, loading: authLoading } = useAuth();
  const { wallet, loading: walletLoading } = useWallet(user?.id);
  const { transactions, loading: txLoading } = useWalletTransactions(user?.id, 100);
  const [filter, setFilter] = useState<FilterTab>("all");

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
            <Link to="/auth"><GoldButton>Sign in</GoldButton></Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  const filteredTx = transactions.filter((tx) => typeMatchesFilter(tx.type, filter));

  const premiumEarned = transactions
    .filter((tx) => tx.type === "premium_bonus" || tx.type === "welcome_bonus")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const prizesEarned = transactions
    .filter((tx) => tx.type === "tournament_prize")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const feesSpent = transactions
    .filter((tx) => tx.type === "tournament_entry")
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  return (
    <PageShell
      eyebrow="Royal Treasury"
      title="My Wallet"
      subtitle="Your coins, transactions, and tournament rewards."
    >
      {/* ── Balance Hero ── */}
      <Card className="relative overflow-hidden p-8">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-gold/10 via-transparent to-transparent" />
        <div className="pointer-events-none absolute inset-0 mandala-bg opacity-20" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-gold/70">Current Balance</div>
            <div className="mt-2 flex items-end gap-3">
              <span className="font-display text-6xl text-gradient-gold">
                {wallet?.balance ?? 0}
              </span>
              <span className="mb-2 flex items-center gap-1 text-lg text-gold/80">
                <Coins className="h-5 w-5" /> Coins
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Available to spend on tournament entries and premium features.
            </p>
          </div>
          <div className="flex gap-3">
            <Link to="/premium">
              <GoldButton>
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
          {
            label: "Premium Bonuses",
            value: premiumEarned,
            icon: Star,
            cls: "text-gold",
          },
          {
            label: "Prize Winnings",
            value: prizesEarned,
            icon: Trophy,
            cls: "text-emerald-400",
          },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label} className="p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Icon className={`h-3.5 w-3.5 ${cls}`} />
              {label}
            </div>
            <div className={`mt-2 font-display text-3xl ${cls}`}>{value}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">coins</div>
          </Card>
        ))}
      </div>

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

        {/* Filter tabs */}
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
                ? "No transactions yet. Buy a premium plan or join a tournament to get started."
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
                    {/* Icon */}
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/5">
                      <TxIcon type={tx.type} />
                    </div>

                    {/* Description */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{tx.description}</span>
                        <TxTypeBadge type={tx.type} />
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {fmtDate(tx.created_at)} · Balance after: {tx.balance_after} coins
                      </div>
                    </div>

                    {/* Amount */}
                    <div
                      className={`flex shrink-0 items-center gap-1 font-display text-lg ${
                        isCredit ? "text-emerald-400" : "text-rose-400"
                      }`}
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

      {/* ── Activity Timeline ── */}
      {transactions.length > 0 && (
        <div className="mt-8">
          <SectionTitle kicker="Timeline" title="Wallet Activity" />
          <Card className="p-6">
            <div className="relative ml-4 border-l border-white/10 pl-8">
              {transactions.slice(0, 10).map((tx, i) => {
                const isCredit = tx.amount > 0;
                return (
                  <div key={tx.id} className="relative mb-6 last:mb-0">
                    {/* Dot */}
                    <span
                      className={`absolute -left-[2.65rem] top-1 h-3 w-3 rounded-full border-2 border-background ${
                        isCredit ? "bg-emerald-400" : "bg-rose-400"
                      }`}
                    />
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{tx.description}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {fmtDate(tx.created_at)}
                        </div>
                      </div>
                      <span
                        className={`font-display text-lg ${isCredit ? "text-emerald-400" : "text-rose-400"}`}
                      >
                        {isCredit ? "+" : ""}
                        {tx.amount} coins
                      </span>
                    </div>
                    {i < Math.min(transactions.length - 1, 9) && <div className="mt-6" />}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
