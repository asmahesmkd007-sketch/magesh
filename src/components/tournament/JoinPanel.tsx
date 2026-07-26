import { memo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Crown,
  Check,
  Coins,
  Loader2,
  LogOut,
  Lock,
  Trophy,
  Skull,
  Swords,
  AlertCircle,
  Wallet as WalletIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  joinTournamentPaid,
  refundTournamentEntry,
  type TournamentEntry,
  type TournamentRow,
} from "@/lib/api/tournamentClient";
import type { Wallet } from "@/lib/api/walletClient";
import { playGameSound } from "@/lib/audio/sounds";
import { AnimatedCoins } from "./bits";

// =====================================================================
// Join / leave section. Handles every state: signed out, can join,
// insufficient balance, already joined, eliminated, locked, live,
// completed, cancelled, full. Paid joins confirm via dialog and the
// wallet balance animates down as the fee is deducted.
// =====================================================================
export const JoinPanel = memo(function JoinPanel({
  t,
  myEntry,
  wallet,
  signedIn,
  onChanged,
}: {
  t: TournamentRow;
  myEntry: TournamentEntry | null;
  wallet: Wallet | null;
  signedIn: boolean;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const balance = wallet?.balance ?? 0;
  const fee = t.entry_fee_coins ?? 0;
  const canAfford = fee === 0 || balance >= fee;
  const isFull = t.player_count >= t.max_players;

  async function doJoin() {
    setBusy(true);
    try {
      await joinTournamentPaid(t.id);
      playGameSound("notify");
      toast.success(fee > 0 ? `Registered! ${fee} coins deducted.` : "Registered successfully!");
      setConfirmOpen(false);
      onChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not register";
      if (msg.includes("Insufficient wallet balance")) {
        toast.error("Insufficient wallet balance.", {
          action: { label: "Get Coins", onClick: () => navigate({ to: "/premium" }) },
        });
      } else if (msg.includes("Already registered")) {
        toast.info("You are already registered.");
        onChanged();
      } else {
        toast.error(msg);
      }
    }
    setBusy(false);
  }

  async function doLeave() {
    setBusy(true);
    try {
      await refundTournamentEntry(t.id);
      playGameSound("notify");
      toast.success(fee > 0 ? "Withdrawn — entry fee refunded." : "Withdrawn.");
      setLeaveOpen(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not withdraw");
    }
    setBusy(false);
  }

  // ---- Resolve the single state to show -----------------------------
  let body: React.ReactNode;

  if (t.status === "cancelled") {
    body = (
      <div className="flex items-center gap-3 text-sm text-rose-400">
        <AlertCircle className="h-5 w-5 shrink-0" />
        Tournament cancelled — all entry fees were refunded.
      </div>
    );
  } else if (t.status === "completed") {
    body = (
      <div className="flex items-center gap-3 text-sm">
        <Trophy className="h-5 w-5 shrink-0 text-gold" />
        {myEntry?.status === "winner" ? (
          <span className="text-gold">You are the champion! 🏆</span>
        ) : t.winner_display ? (
          <span>
            Tournament finished — <span className="text-gold">{t.winner_display}</span> took the
            crown.
          </span>
        ) : (
          <span className="text-muted-foreground">Tournament has ended.</span>
        )}
      </div>
    );
  } else if (!signedIn) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">Sign in to take a seat at the table.</div>
        <Link to="/login">
          <GoldButton>
            <Crown className="h-4 w-4" /> Sign in to Join
          </GoldButton>
        </Link>
      </div>
    );
  } else if (myEntry?.status === "eliminated") {
    body = (
      <div className="flex items-center gap-3 text-sm">
        <Skull className="h-5 w-5 shrink-0 text-rose-400" />
        <span className="text-muted-foreground">
          Eliminated in Round {myEntry.eliminated_in_round ?? "?"} — you can keep watching the
          bracket live.
        </span>
      </div>
    );
  } else if (myEntry) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-2.5 text-sm text-emerald">
          <Check className="h-4 w-4" />
          {t.status === "live" ? "You're in — good luck!" : "Registered"}
        </div>
        {(t.status === "live" || t.status === "locked") && (
          <Link
            to="/arena/$id"
            params={{ id: t.id }}
            onClick={() => sessionStorage.removeItem(`arena-exited:${t.id}`)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-black shadow-[0_0_18px_rgba(16,185,129,0.35)] transition hover:brightness-110"
          >
            <Swords className="h-4 w-4" /> ENTER ARENA
          </Link>
        )}
        {t.status === "upcoming" && (
          <button
            onClick={() => setLeaveOpen(true)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2.5 text-xs text-muted-foreground transition hover:border-rose-500/30 hover:text-rose-400"
          >
            <LogOut className="h-3.5 w-3.5" /> Leave {fee > 0 && `(refund ${fee} coins)`}
          </button>
        )}
        {t.status === "locked" && (
          <span className="flex items-center gap-1.5 text-xs text-amber-400">
            <Lock className="h-3.5 w-3.5" /> Seats locked — matches are being prepared
          </span>
        )}
      </div>
    );
  } else if (t.status === "locked" || t.status === "live") {
    body = (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Lock className="h-5 w-5 shrink-0 text-amber-400" />
        Registration closed — {t.status === "live" ? "tournament is live" : "starting soon"}. You
        can spectate every board.
      </div>
    );
  } else if (isFull) {
    body = (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <AlertCircle className="h-5 w-5 shrink-0 text-amber-400" />
        Tournament is full.
      </div>
    );
  } else {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <GoldButton
            onClick={() => (fee > 0 ? setConfirmOpen(true) : void doJoin())}
            disabled={busy || !canAfford}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
            {busy ? "Joining…" : fee > 0 ? `Join · ${fee} coins` : "Join Free"}
          </GoldButton>
          {!canAfford && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-400">
              <AlertCircle className="h-3.5 w-3.5" />
              Need {fee - balance} more coins
              <Link to="/premium" className="ml-1 font-medium text-gold underline">
                Get Coins
              </Link>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-2.5 text-right">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <WalletIcon className="h-3 w-3" /> Your balance
          </div>
          <div className="mt-0.5 font-display text-lg text-gradient-gold">
            <AnimatedCoins value={balance} /> coins
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className="p-5 md:p-6">
      {body}

      {/* Paid-join confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <Coins className="h-5 w-5 text-gold" /> Confirm entry
            </DialogTitle>
            <DialogDescription>
              Joining <span className="text-foreground">{t.name}</span> costs{" "}
              <span className="text-gold">{fee} coins</span>. You can withdraw for a full refund any
              time before the tournament locks.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Balance
              </div>
              <div className="mt-1 font-display text-gold">{balance}</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Entry Fee
              </div>
              <div className="mt-1 font-display text-rose-400">−{fee}</div>
            </div>
            <div className="rounded-xl border border-gold/20 bg-gold/5 p-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                After
              </div>
              <div className="mt-1 font-display text-gold">{balance - fee}</div>
            </div>
          </div>
          <DialogFooter>
            <GhostButton onClick={() => setConfirmOpen(false)} disabled={busy}>
              Cancel
            </GhostButton>
            <GoldButton onClick={() => void doJoin()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Pay &amp; Join
            </GoldButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave confirmation */}
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Leave tournament?</DialogTitle>
            <DialogDescription>
              You will give up your seat in {t.name}.
              {fee > 0 && <> Your {fee}-coin entry fee will be refunded in full.</>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <GhostButton onClick={() => setLeaveOpen(false)} disabled={busy}>
              Stay In
            </GhostButton>
            <button
              onClick={() => void doLeave()}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-2.5 text-sm font-medium text-rose-400 transition hover:bg-rose-500/20 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Leave &amp; Refund
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
});
