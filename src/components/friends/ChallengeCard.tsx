import { Link, useNavigate } from "@tanstack/react-router";
import { Swords, Check, X, Loader2 } from "lucide-react";
import { useState } from "react";
import { Card, GoldButton, GhostButton, Pill } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import { SeasonShield } from "@/components/ranking/SeasonShield";
import type { ChallengeRow } from "@/types/friend";

const GAME_TYPE_LABELS: Record<string, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  classical: "Classical",
  correspondence: "Correspondence",
};

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function IncomingChallengeCard({
  challenge,
  onRespond,
  style,
}: {
  challenge: ChallengeRow;
  onRespond: (id: string, accept: boolean) => Promise<string | null | void>;
  style?: React.CSSProperties;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const name = challenge.other_display ?? challenge.other_username ?? "Unknown";

  async function handle(accept: boolean) {
    setBusy(accept ? "accept" : "decline");
    try {
      const gameId = await onRespond(challenge.id, accept);
      if (accept && gameId) navigate({ to: "/game/$id", params: { id: gameId } });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      style={style}
      className="animate-rise-in relative flex flex-col gap-3 overflow-hidden p-4 transition-colors duration-200 hover:border-gold/25 sm:flex-row sm:items-center"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-gold/60 to-transparent" />
      <Link to="/profile" search={{ id: challenge.other_id }} className="shrink-0">
        <UserAvatar avatarUrl={challenge.other_avatar_url} displayName={name} size="sm" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <Link
            to="/profile"
            search={{ id: challenge.other_id }}
            className="font-medium hover:text-gold"
          >
            {name}
          </Link>
          <span className="text-muted-foreground">challenged you</span>
          <SeasonShield sp={challenge.other_rating ?? 0} size="xs" variant="chip" />
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Pill tone="gold">
            <Swords className="h-3 w-3" /> {challenge.time_control}
          </Pill>
          <Pill tone="muted">{GAME_TYPE_LABELS[challenge.time_class] ?? challenge.time_class}</Pill>
          <Pill tone={challenge.is_rated ? "emerald" : "muted"}>
            {challenge.is_rated ? "Rated" : "Casual"}
          </Pill>
          <Pill tone="muted">{relTime(challenge.created_at)}</Pill>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <GoldButton
          onClick={() => handle(true)}
          disabled={busy !== null}
          className="flex-1 sm:flex-none"
        >
          {busy === "accept" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Accept
        </GoldButton>
        <GhostButton
          onClick={() => handle(false)}
          disabled={busy !== null}
          className="flex-1 sm:flex-none"
        >
          {busy === "decline" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
          Decline
        </GhostButton>
      </div>
    </Card>
  );
}

export function OutgoingChallengeCard({
  challenge,
  onCancel,
  style,
}: {
  challenge: ChallengeRow;
  onCancel: (id: string) => void;
  style?: React.CSSProperties;
}) {
  const name = challenge.other_display ?? challenge.other_username ?? "Unknown";
  return (
    <Card
      style={style}
      className="animate-rise-in flex items-center gap-3 p-4 transition-colors duration-200 hover:border-gold/20"
    >
      <UserAvatar avatarUrl={challenge.other_avatar_url} displayName={name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
          </span>
          {name} · Waiting…
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Pill tone="gold">{challenge.time_control}</Pill>
          <Pill tone={challenge.is_rated ? "emerald" : "muted"}>
            {challenge.is_rated ? "Rated" : "Casual"}
          </Pill>
        </div>
      </div>
      <GhostButton onClick={() => onCancel(challenge.id)}>Cancel Challenge</GhostButton>
    </Card>
  );
}
