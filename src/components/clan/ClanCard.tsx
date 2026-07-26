import { Link } from "@tanstack/react-router";
import { Users, Globe, Lock, Mail } from "lucide-react";
import { ClanEmblem } from "@/components/clan/ClanPrimitives";
import { gradientFromSlug } from "@/lib/clan";
import type { ClanSummary } from "@/types/clan";

const PRIVACY_META = {
  public: { icon: Globe, label: "Open" },
  private: { icon: Mail, label: "Request" },
  invite_only: { icon: Lock, label: "Invite" },
} as const;

export function ClanCard({ clan, joinSlot }: { clan: ClanSummary; joinSlot?: React.ReactNode }) {
  const privacy = PRIVACY_META[clan.privacy] ?? PRIVACY_META.public;
  const PrivacyIcon = privacy.icon;

  return (
    <Link to="/clan/$slug" params={{ slug: clan.slug }} className="group block">
      <div className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] transition-all duration-300 hover:-translate-y-1 hover:border-gold/30 hover:shadow-[0_8px_30px_rgba(212,175,55,0.08)]">
        <div className={`relative h-20 bg-gradient-to-br ${gradientFromSlug(clan.slug)}`}>
          <div className="absolute inset-0 mandala-bg opacity-40" />
          <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/80 backdrop-blur-sm">
            <PrivacyIcon className="h-3 w-3" /> {privacy.label}
          </div>
        </div>
        <div className="relative -mt-8 px-4 pb-4">
          <ClanEmblem
            name={clan.name}
            slug={clan.slug}
            logoUrl={clan.logo_url}
            className="h-16 w-16 rounded-xl text-2xl ring-4 ring-[#0B0D10]"
          />
          <div className="mt-2 flex items-center gap-2">
            <span className="truncate font-display text-lg text-white transition-colors group-hover:text-gold">
              {clan.name}
            </span>
            <span className="shrink-0 rounded bg-gold/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-gold">
              [{clan.tag}]
            </span>
          </div>
          <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs text-muted-foreground">
            {clan.description || "No description provided."}
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {clan.member_count}
            </span>
            <span className="truncate px-2">🌍 {clan.country}</span>
            {joinSlot}
          </div>
        </div>
      </div>
    </Link>
  );
}
