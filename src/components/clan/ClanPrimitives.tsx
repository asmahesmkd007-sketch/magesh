import { Crown, Shield, User, Loader2, ShieldAlert } from "lucide-react";
import type { ClanRole } from "@/types/clan";
import { gradientFromSlug } from "@/lib/clan";
import { useEffect, useState, type ReactNode } from "react";
import { useResolvedAvatarUrl } from "@/components/site/UserAvatar";

/** Square clan emblem: logo image or gradient monogram fallback. */
export function ClanEmblem({
  name,
  slug,
  logoUrl,
  className = "h-12 w-12 rounded-xl text-xl",
}: {
  name: string;
  slug: string;
  logoUrl: string | null;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  useEffect(() => setHasError(false), [logoUrl]);

  if (logoUrl && !hasError) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={`${className} object-cover bg-black/50 shrink-0`}
        onError={() => setHasError(true)}
      />
    );
  }
  return (
    <div
      className={`${className} grid place-items-center bg-gradient-to-br ${gradientFromSlug(slug)} font-display text-white shrink-0`}
    >
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

/** Circular member avatar with image fallback. */
export function MemberAvatar({
  username,
  avatarUrl,
  className = "h-10 w-10 text-sm",
}: {
  username: string | undefined;
  avatarUrl: string | null | undefined;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const primaryUrl = useResolvedAvatarUrl(avatarUrl);

  useEffect(() => {
    setHasError(false);
  }, [primaryUrl]);

  if (primaryUrl && !hasError) {
    return (
      <img
        src={primaryUrl}
        alt={username ?? "Member"}
        className={`${className} rounded-full object-cover bg-white/5 shrink-0`}
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <div
      className={`${className} grid place-items-center rounded-full bg-white/5 font-display text-gold shrink-0`}
    >
      {username?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

const ROLE_STYLES: Record<ClanRole, { label: string; icon: typeof Crown; classes: string }> = {
  leader: { label: "Leader", icon: Crown, classes: "bg-gold/15 text-gold border-gold/30" },
  co_leader: {
    label: "Co-Leader",
    icon: Shield,
    classes: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  },
  member: {
    label: "Member",
    icon: User,
    classes: "bg-white/5 text-muted-foreground border-white/10",
  },
};

export function RoleBadge({ role }: { role: ClanRole }) {
  const { label, icon: Icon, classes } = ROLE_STYLES[role];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${classes}`}
    >
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

export function StatTile({
  label,
  value,
  accent = "text-white",
}: {
  label: string;
  value: ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 backdrop-blur-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 font-display text-2xl ${accent}`}>{value}</div>
    </div>
  );
}

export function PanelLoading() {
  return (
    <div className="grid place-items-center py-24">
      <Loader2 className="h-8 w-8 animate-spin text-gold" />
    </div>
  );
}

export function PanelEmpty({
  icon: Icon = ShieldAlert,
  title,
  hint,
}: {
  icon?: typeof ShieldAlert;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02] p-12 text-center">
      <Icon className="mb-4 h-12 w-12 text-muted-foreground/30" />
      <div className="font-display text-lg text-white">{title}</div>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PanelError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5 p-12 text-center">
      <ShieldAlert className="mb-4 h-12 w-12 text-destructive/60" />
      <div className="font-display text-lg text-white">Something went wrong</div>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
        >
          Try again
        </button>
      )}
    </div>
  );
}
