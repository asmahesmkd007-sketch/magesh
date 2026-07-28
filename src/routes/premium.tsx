import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { Check, Crown, Star, Sparkles, Coins, Loader2, Wallet, Gift } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { creditPremiumBonus } from "@/lib/api/walletClient";
import { toast } from "sonner";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";

export const Route = createFileRoute("/premium")({
  head: () =>
    seo({
      title: "ChessOx Premium — Chess Membership Plans | ChessOx",
      description:
        "Compare ChessOx Premium membership plans. Unlock unlimited chess puzzles, deeper game analysis, an ad-free experience and premium online chess tournaments.",
      keywords: [
        "chess membership",
        "premium chess account",
        "unlimited chess puzzles",
        "chess analysis",
        "online chess game",
      ],
      path: "/premium",
      jsonLd: [
        webPageLd({
          name: "ChessOx Premium — Membership Plans",
          description:
            "Premium membership tiers on ChessOx and the chess features included with each plan, alongside the free tier that covers everyday play.",
          path: "/premium",
          primaryTopic: "Chess membership plans",
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Premium", path: "/premium" },
        ]),
      ],
    }),
  component: Premium,
});

// Coin amounts granted per plan (base). Server adds +10 bonus on top.
const PLAN_COINS: Record<string, number> = {
  Gold: 300,
  Platinum: 600,
  Maharaja: 1300,
};

const PLANS = [
  {
    name: "Gold",
    price: "₹299",
    period: "/month",
    icon: Star,
    popular: false,
    features: ["Unlimited Puzzles", "Basic Analysis", "Ad-free Experience", "Cloud Game Storage"],
  },
  {
    name: "Platinum",
    price: "₹599",
    period: "/month",
    icon: Sparkles,
    popular: true,
    features: [
      "Everything in Gold",
      "Deep Engine Analysis",
      "Premium Masterclasses",
      "Tournament Discounts",
      "Priority Support",
    ],
  },
  {
    name: "Maharaja",
    price: "₹1,299",
    period: "/month",
    icon: Crown,
    popular: false,
    features: [
      "Everything in Platinum",
      "1-on-1 Coaching Hours",
      "Custom Tournament Hosting",
      "Maharaja Chess Set",
      "Royal Badge",
    ],
  },
];

const COMPARISON = [
  ["Puzzles per day", "Unlimited", "Unlimited", "Unlimited"],
  ["Analysis depth", "Basic", "Advanced", "Master"],
  ["Tournaments", "Open", "Discounted", "VIP entry"],
  ["Royal badge", "—", "✓", "Gold ✓"],
];

function Premium() {
  const { user } = useAuth();
  const { wallet, refetch: refetchWallet } = useWallet(user?.id);

  // For unauthenticated users: which plan they clicked (auth prompt)
  const [guestPlan, setGuestPlan] = useState<string | null>(null);
  // For authenticated users: purchase confirmation dialog
  const [confirmPlan, setConfirmPlan] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  function handleChoose(planName: string) {
    if (!user) {
      setGuestPlan(planName);
      return;
    }
    setConfirmPlan(planName);
  }

  async function handleConfirmPurchase() {
    if (!confirmPlan || !user) return;
    setPurchasing(true);

    // Idempotency key: plan + user + timestamp (allows multiple purchases of same plan).
    // In production this would be the payment provider's transaction ID.
    const idempotencyKey = `premium_${confirmPlan.toLowerCase()}_${user.id}_${Date.now()}`;
    const baseCoins = PLAN_COINS[confirmPlan] ?? 0;

    try {
      await creditPremiumBonus(confirmPlan, baseCoins, idempotencyKey);
      await refetchWallet();
      toast.success(
        `${confirmPlan} activated! ${baseCoins + 10} coins added to your wallet (${baseCoins} + 10 bonus).`,
      );
      setConfirmPlan(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Purchase failed. Please try again.");
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <PageShell>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl">
        <div className="absolute inset-0 gradient-royal" />
        <div className="absolute inset-0 mandala-bg opacity-50" />
        <div className="relative px-6 py-16 text-center md:py-24">
          <Crown className="mx-auto h-12 w-12 text-gold" />
          <div className="mt-3 font-display text-xs uppercase tracking-[0.4em] text-gold">
            Premium Membership
          </div>
          <h1 className="mt-3 font-display text-5xl md:text-7xl">
            Rule the <span className="text-gradient-gold">Royal Court</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Three tiers of mastery. One royal experience. Choose your throne.
          </p>
          {user && (
            <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold">
              <Coins className="h-4 w-4" />
              Wallet Balance: <strong>{wallet?.balance ?? 0} coins</strong>
              <Link to="/wallet" className="ml-1 text-xs underline opacity-70 hover:opacity-100">
                View Wallet
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Coin info banner */}
      <Card className="mt-8 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full gradient-gold text-background">
            <Gift className="h-5 w-5" />
          </span>
          <div>
            <div className="font-display text-base">Coins included with every plan</div>
            <div className="text-sm text-muted-foreground">
              Each plan grants base coins + <strong className="text-gold">10 bonus coins</strong>.
              Use coins to enter paid tournaments and unlock rewards.
            </div>
          </div>
        </div>
        <div className="flex gap-3 text-sm">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className="rounded-xl border border-gold/15 bg-white/[0.03] px-3 py-2 text-center"
            >
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                {p.name}
              </div>
              <div className="mt-1 flex items-center gap-1 text-gold">
                <Coins className="h-3.5 w-3.5" />
                <span className="font-display">{PLAN_COINS[p.name] + 10}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Plan cards */}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {PLANS.map((p) => {
          const totalCoins = PLAN_COINS[p.name] + 10;
          return (
            <Card
              key={p.name}
              className={`relative p-8 ${p.popular ? "ring-2 ring-gold shadow-gold-glow" : ""}`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-gold px-3 py-1 text-xs font-medium text-[#0B0D10]">
                  Most Royal
                </span>
              )}
              <p.icon className="h-8 w-8 text-gold" />
              <div className="mt-4 font-display text-3xl">{p.name}</div>
              <div className="mt-2">
                <span className="font-display text-5xl text-gradient-gold">{p.price}</span>
                <span className="text-muted-foreground">{p.period}</span>
              </div>

              {/* Coin grant */}
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-gold/20 bg-gold/5 px-4 py-2.5">
                <Coins className="h-4 w-4 text-gold" />
                <div className="text-sm">
                  <span className="text-gold font-medium">{totalCoins} coins</span>
                  <span className="ml-1 text-muted-foreground text-xs">
                    ({PLAN_COINS[p.name]} + 10 bonus)
                  </span>
                </div>
              </div>

              <GoldButton className="mt-8 w-full" onClick={() => handleChoose(p.name)}>
                Choose {p.name}
              </GoldButton>
            </Card>
          );
        })}
      </div>

      {/* Comparison table */}
      <Card className="mt-10 overflow-hidden">
        <div className="border-b border-white/5 p-6">
          <div className="font-display text-2xl">Compare Plans</div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Feature</th>
              <th className="px-4 py-3">Gold</th>
              <th className="px-4 py-3 text-gold">Platinum</th>
              <th className="px-4 py-3">Maharaja</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map(([f, ...vals]) => (
              <tr key={f} className="border-t border-white/5">
                <td className="px-4 py-3">{f}</td>
                {vals.map((v, i) => (
                  <td key={i} className="px-4 py-3 text-center text-muted-foreground">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-gold/10 bg-gold/[0.03]">
              <td className="px-4 py-3 text-gold font-medium">Coins granted</td>
              {PLANS.map((p) => (
                <td key={p.name} className="px-4 py-3 text-center text-gold font-display">
                  {PLAN_COINS[p.name] + 10}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </Card>

      {/* ── Guest auth dialog ── */}
      <Dialog open={guestPlan !== null} onOpenChange={(open) => !open && setGuestPlan(null)}>
        <DialogContent className="border-gold/25 bg-background/95 backdrop-blur-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center font-display text-3xl">
              Sign in to subscribe
            </DialogTitle>
            <DialogDescription className="text-center">
              Create your royal account to claim the {guestPlan} throne.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <GhostButton onClick={() => setGuestPlan(null)}>Not now</GhostButton>
            <GoldButton as={Link} to="/auth">
              Sign In
            </GoldButton>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Purchase confirmation dialog ── */}
      <Dialog
        open={confirmPlan !== null}
        onOpenChange={(open) => !open && !purchasing && setConfirmPlan(null)}
      >
        <DialogContent className="border-gold/25 bg-background/95 backdrop-blur-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center font-display text-3xl">
              Confirm Purchase
            </DialogTitle>
            <DialogDescription className="text-center">
              {confirmPlan} plan ·{" "}
              {confirmPlan ? PLANS.find((p) => p.name === confirmPlan)?.price : ""}
            </DialogDescription>
          </DialogHeader>

          {confirmPlan && (
            <div className="space-y-4 py-2">
              {/* Coin breakdown */}
              <div className="rounded-2xl border border-gold/20 bg-gold/5 p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Base coins</span>
                  <span className="flex items-center gap-1 text-gold">
                    <Coins className="h-3.5 w-3.5" />
                    {PLAN_COINS[confirmPlan]}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Bonus coins</span>
                  <span className="flex items-center gap-1 text-emerald">
                    <Gift className="h-3.5 w-3.5" />
                    +10
                  </span>
                </div>
                <div className="border-t border-white/10 pt-2 flex items-center justify-between font-display text-lg">
                  <span>Total coins</span>
                  <span className="text-gradient-gold flex items-center gap-1">
                    <Coins className="h-4 w-4 text-gold" />
                    {PLAN_COINS[confirmPlan] + 10}
                  </span>
                </div>
              </div>

              {/* Current balance */}
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Wallet className="h-4 w-4" /> Current balance
                </span>
                <span className="text-gold">{wallet?.balance ?? 0} coins</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-gold/15 bg-gold/5 px-4 py-3 text-sm">
                <span className="text-muted-foreground">Balance after purchase</span>
                <span className="font-display text-gradient-gold">
                  {(wallet?.balance ?? 0) + PLAN_COINS[confirmPlan] + 10} coins
                </span>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                Coins are added instantly after purchase confirmation. In production this step
                follows real payment verification.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <GhostButton onClick={() => setConfirmPlan(null)} disabled={purchasing}>
              Cancel
            </GhostButton>
            <GoldButton onClick={handleConfirmPurchase} disabled={purchasing}>
              {purchasing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing…
                </>
              ) : (
                <>
                  <Coins className="h-4 w-4" /> Confirm Purchase
                </>
              )}
            </GoldButton>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
