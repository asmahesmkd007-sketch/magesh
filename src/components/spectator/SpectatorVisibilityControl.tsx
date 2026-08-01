import { Check, ChevronDown, Eye, Lock, Users } from "lucide-react";
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
  showHint = true,
  showTitle = true,
  mode = "inline",
}: {
  value: SpectatorVisibility;
  onChange: (next: SpectatorVisibility) => void;
  /** Required when scope is "game". */
  gameId?: string;
  scope: "game" | "account";
  className?: string;
  showHint?: boolean;
  showTitle?: boolean;
  mode?: "inline" | "dropdown";
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<SpectatorVisibility | null>(null);

  const apply = async (next: SpectatorVisibility) => {
    setOpen(false);
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

  if (mode === "dropdown") {
    const currentOpt = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
    const Icon = currentOpt.icon;

    return (
      <div className={`relative ${className}`}>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-gold/30 bg-gold/10 text-[11px] font-semibold text-gold hover:bg-gold/20 transition-all shadow-sm"
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{currentOpt.label}</span>
          <ChevronDown
            className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <>
            {/* Backdrop overlay to close on click outside */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

            {/* Dropdown Menu */}
            <div className="absolute right-0 top-full mt-1.5 z-50 w-44 rounded-xl border border-gold/30 bg-[#0C0E12]/95 p-1.5 shadow-2xl shadow-black/80 backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-150">
              <div className="text-[10px] font-semibold text-gold/70 px-2 py-1 uppercase tracking-wider">
                Spectator Access
              </div>
              <div className="space-y-1">
                {OPTIONS.map((opt) => {
                  const OptIcon = opt.icon;
                  const active = value === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={saving !== null}
                      onClick={() => void apply(opt.value)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        active
                          ? "bg-gold/20 text-gold font-bold"
                          : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <OptIcon className="h-3.5 w-3.5" />
                        <span>{opt.label}</span>
                      </div>
                      {active && <Check className="h-3.5 w-3.5 text-gold" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      {showTitle && (
        <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          <Eye className="h-3.5 w-3.5" aria-hidden />
          {scope === "game" ? "Who can watch this game" : "Who can watch my games"}
        </div>
      )}
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
      {showHint && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {OPTIONS.find((o) => o.value === value)?.hint}.{" "}
          {scope === "game"
            ? "Your opponent sets this for their own side too — the stricter choice wins."
            : "Applies to every game you start from now on."}
        </p>
      )}
    </div>
  );
}
