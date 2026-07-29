import { Eye, Lock, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { setSpectatorDefault, setSpectatorVisibility } from "@/lib/api/spectatorClient";
import type { SpectatorVisibility } from "@/lib/spectator/types";

const OPTIONS: {
  value: SpectatorVisibility;
  label: string;
  hint: string;
  icon: typeof Eye;
}[] = [
  { value: "public", label: "Public", hint: "Anyone can watch", icon: Eye },
  { value: "friends", label: "Friends", hint: "Only your friends can watch", icon: Users },
  { value: "private", label: "Private", hint: "Nobody can watch", icon: Lock },
];

/**
 * Who may spectate a match.
 *
 * Each player sets this for THEIR OWN side; the match ends up as visible
 * as the more private of the two wants it. That asymmetry is deliberate
 * — a player can always shut their own game off from an audience, and
 * can never expose an opponent who did not agree to one.
 *
 * `scope="game"` writes the per-match override; `scope="account"` writes
 * the default applied to every future match (the only place the choice
 * can be made ahead of a Quick Match, which starts with no lobby).
 */
export function SpectatorVisibilityControl({
  value,
  onChange,
  gameId,
  scope,
  className = "",
}: {
  value: SpectatorVisibility;
  onChange: (next: SpectatorVisibility) => void;
  /** Required when scope is "game". */
  gameId?: string;
  scope: "game" | "account";
  className?: string;
}) {
  const [saving, setSaving] = useState<SpectatorVisibility | null>(null);

  const apply = async (next: SpectatorVisibility) => {
    if (next === value || saving) return;
    setSaving(next);
    // Optimistic: the control is a preference, and a failed write is
    // reverted below rather than blocking the UI behind a round trip.
    const previous = value;
    onChange(next);
    try {
      if (scope === "game") {
        if (!gameId) throw new Error("Missing game");
        await setSpectatorVisibility(gameId, next);
      } else {
        await setSpectatorDefault(next);
      }
      if (next === "private") toast.success("Spectators turned off for this game.");
    } catch (e) {
      onChange(previous);
      toast.error(e instanceof Error ? e.message : "Could not update spectator setting.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        <Eye className="h-3.5 w-3.5" aria-hidden />
        {scope === "game" ? "Who can watch this game" : "Who can watch my games"}
      </div>
      <div
        className="flex gap-1.5"
        role="radiogroup"
        aria-label={
          scope === "game" ? "Spectator access for this game" : "Default spectator access"
        }
      >
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={opt.hint}
              disabled={saving !== null}
              onClick={() => void apply(opt.value)}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                active
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-gold/25 hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {OPTIONS.find((o) => o.value === value)?.hint}.{" "}
        {scope === "game"
          ? "Your opponent sets this for their own side too — the stricter choice wins."
          : "Applies to every game you start from now on."}
      </p>
    </div>
  );
}
