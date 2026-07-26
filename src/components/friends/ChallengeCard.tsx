import { useNavigate } from "@tanstack/react-router";
import { Swords, Check, X, Loader2 } from "lucide-react";
import { useState } from "react";
import { Card, GoldButton, GhostButton, Pill } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import type { ChallengeRow } from "@/types/friend";

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
}: {
  challenge: ChallengeRow;
  onRespond: (id: string, accept: boolean) => Promise<string | null | void>;
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
    <Card className="flex items-center gap-3 p-4">
      <UserAvatar avatarUrl={challenge.other_avatar_url} displayName={name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="text-sm">{name} challenged you</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Pill tone="gold">{challenge.time_control}</Pill>
          <Pill tone={challenge.is_rated ? "emerald" : "muted"}>
            {challenge.is_rated ? "Rated" : "Casual"}
          </Pill>
          <Pill tone="muted">{relTime(challenge.created_at)}</Pill>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <GoldButton onClick={() => handle(true)} disabled={busy !== null}>
          {busy === "accept" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Accept
        </GoldButton>
        <GhostButton onClick={() => handle(false)} disabled={busy !== null}>
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
}: {
  challenge: ChallengeRow;
  onCancel: (id: string) => void;
}) {
  const name = challenge.other_display ?? challenge.other_username ?? "Unknown";
  return (
    <Card className="flex items-center gap-3 p-4">
      <UserAvatar avatarUrl={challenge.other_avatar_url} displayName={name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="text-sm flex items-center gap-2">
          <Swords className="h-3.5 w-3.5 text-gold" /> {name} · Waiting…
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
