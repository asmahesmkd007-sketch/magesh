import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { Check, Crown, Star, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/premium")({
  head: () => ({ meta: [{ title: "Premium — ChessOx" }] }),
  component: Premium,
});

const PLANS = [
  { name: "Gold", price: "₹299", period: "/month", icon: Star, popular: false, features: ["Unlimited Puzzles", "Basic Analysis", "Ad-free Experience", "Cloud Game Storage"] },
  { name: "Platinum", price: "₹599", period: "/month", icon: Sparkles, popular: true, features: ["Everything in Gold", "Deep Engine Analysis", "Premium Masterclasses", "Tournament Discounts", "Priority Support"] },
  { name: "Maharaja", price: "₹1,299", period: "/month", icon: Crown, popular: false, features: ["Everything in Platinum", "1-on-1 Coaching Hours", "Custom Tournament Hosting", "Maharaja Chess Set", "Royal Badge"] },
];

const COMPARISON = [
  ["Puzzles per day", "Unlimited", "Unlimited", "Unlimited"],
  ["Analysis depth", "Basic", "Advanced", "Master"],
  ["Masterclasses", "5", "All", "All + Live"],
  ["Coaching hours", "—", "—", "2 / month"],
  ["Tournaments", "Open", "Discounted", "VIP entry"],
  ["Royal badge", "—", "✓", "Gold ✓"],
];

function Premium() {
  const { user } = useAuth();
  const [chosenPlan, setChosenPlan] = useState<string | null>(null);

  const choose = (plan: string) => {
    if (user) {
      toast.info(`${plan} checkout is being prepared — payments arrive in the next phase.`);
      return;
    }
    setChosenPlan(plan);
  };

  return (
    <PageShell>
      <section className="relative overflow-hidden rounded-3xl">
        <div className="absolute inset-0 gradient-royal" />
        <div className="absolute inset-0 mandala-bg opacity-50" />
        <div className="relative px-6 py-16 text-center md:py-24">
          <Crown className="mx-auto h-12 w-12 text-gold" />
          <div className="mt-3 font-display text-xs uppercase tracking-[0.4em] text-gold">Premium Membership</div>
          <h1 className="mt-3 font-display text-5xl md:text-7xl">Rule the <span className="text-gradient-gold">Royal Court</span></h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">Three tiers of mastery. One royal experience. Choose your throne.</p>
        </div>
      </section>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {PLANS.map((p) => (
          <Card key={p.name} className={`relative p-8 ${p.popular ? "ring-2 ring-gold shadow-gold-glow" : ""}`}>
            {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-gold px-3 py-1 text-xs font-medium text-[#0B0D10]">Most Royal</span>}
            <p.icon className="h-8 w-8 text-gold" />
            <div className="mt-4 font-display text-3xl">{p.name}</div>
            <div className="mt-2"><span className="font-display text-5xl text-gradient-gold">{p.price}</span><span className="text-muted-foreground">{p.period}</span></div>
            <ul className="mt-6 space-y-2.5 text-sm">
              {p.features.map(f => (
                <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald" /> {f}</li>
              ))}
            </ul>
            <GoldButton className="mt-8 w-full" onClick={() => choose(p.name)}>Choose {p.name}</GoldButton>
          </Card>
        ))}
      </div>

      <Card className="mt-10 overflow-hidden">
        <div className="border-b border-white/5 p-6"><div className="font-display text-2xl">Compare Plans</div></div>
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-widest text-muted-foreground">
            <tr><th className="px-4 py-3 text-left">Feature</th><th className="px-4 py-3">Gold</th><th className="px-4 py-3 text-gold">Platinum</th><th className="px-4 py-3">Maharaja</th></tr>
          </thead>
          <tbody>
            {COMPARISON.map(([f, ...vals]) => (
              <tr key={f} className="border-t border-white/5">
                <td className="px-4 py-3">{f}</td>
                {vals.map((v, i) => <td key={i} className="px-4 py-3 text-center text-muted-foreground">{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={chosenPlan !== null} onOpenChange={(open) => !open && setChosenPlan(null)}>
        <DialogContent className="border-gold/25 bg-background/95 backdrop-blur-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center font-display text-3xl">Sign in to subscribe</DialogTitle>
            <DialogDescription className="text-center">
              Create your royal account to claim the {chosenPlan} throne.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <GhostButton onClick={() => setChosenPlan(null)}>Not now</GhostButton>
            <GoldButton as={Link} to="/auth">Sign In</GoldButton>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
