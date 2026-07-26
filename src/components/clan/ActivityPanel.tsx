import { useEffect, useState } from "react";
import {
  History,
  UserPlus,
  UserMinus,
  Shield,
  ShieldOff,
  Crown,
  Pencil,
  Check,
  X,
  Swords,
  Flag,
  Trophy,
} from "lucide-react";
import { getClanActivity } from "@/lib/clanApi";
import { PanelEmpty, PanelLoading } from "@/components/clan/ClanPrimitives";
import type { ClanActivity, ClanActivityType } from "@/types/clan";

const META: Record<ClanActivityType, { icon: typeof History; text: (a: ClanActivity) => string }> =
  {
    created: { icon: Trophy, text: () => "founded the clan" },
    joined: { icon: UserPlus, text: () => "joined the clan" },
    left: { icon: UserMinus, text: () => "left the clan" },
    kicked: {
      icon: UserMinus,
      text: (a) => `removed ${a.target?.username ?? "a member"} from the clan`,
    },
    promoted: {
      icon: Shield,
      text: (a) => `promoted ${a.target?.username ?? "a member"} to Co-Leader`,
    },
    demoted: {
      icon: ShieldOff,
      text: (a) => `demoted ${a.target?.username ?? "a member"} to Member`,
    },
    edited: { icon: Pencil, text: () => "updated the clan details" },
    transferred: {
      icon: Crown,
      text: (a) => `transferred leadership to ${a.target?.username ?? "a member"}`,
    },
    request_approved: {
      icon: Check,
      text: (a) => `approved ${a.target?.username ?? "a player"}'s join request`,
    },
    request_rejected: {
      icon: X,
      text: (a) => `rejected ${a.target?.username ?? "a player"}'s join request`,
    },
    war_declared: {
      icon: Swords,
      text: (a) => `declared war on ${(a.meta.opponent as string) ?? "a clan"}`,
    },
    war_started: {
      icon: Swords,
      text: (a) => `war began against ${(a.meta.opponent as string) ?? "a clan"}`,
    },
    war_declined: {
      icon: Flag,
      text: (a) => `declined war against ${(a.meta.opponent as string) ?? "a clan"}`,
    },
    war_finished: { icon: Trophy, text: () => "a clan war concluded" },
  };

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ActivityPanel({ clanId, refreshKey }: { clanId: string; refreshKey?: number }) {
  const [items, setItems] = useState<ClanActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getClanActivity(clanId)
      .then((rows) => !cancelled && setItems(rows))
      .catch(() => !cancelled && setItems([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [clanId, refreshKey]);

  if (loading) return <PanelLoading />;
  if (items.length === 0) {
    return (
      <PanelEmpty
        icon={History}
        title="No activity yet"
        hint="Clan events like joins, promotions, and wars will show up here."
      />
    );
  }

  return (
    <div className="space-y-2">
      {items.map((a) => {
        const entry = META[a.type];
        const Icon = entry?.icon ?? History;
        return (
          <div
            key={a.id}
            className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-gold">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 text-sm text-white">
              <span className="font-medium">{a.actor?.username ?? "Someone"}</span>{" "}
              <span className="text-muted-foreground">{entry ? entry.text(a) : a.type}</span>
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {timeAgo(a.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
