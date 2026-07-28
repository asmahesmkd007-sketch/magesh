import { useEffect, useState } from "react";
import { X, Swords, Loader2 } from "lucide-react";
import { GoldButton, GhostButton } from "@/components/site/Primitives";
import type { TimeClass } from "@/lib/api/gameClient";

const TIME_CONTROLS: { label: string; tc: string; class: TimeClass; sec: number; inc: number }[] = [
  { label: "1+0 Bullet", tc: "1+0", class: "bullet", sec: 60, inc: 0 },
  { label: "3+0 Blitz", tc: "3+0", class: "blitz", sec: 180, inc: 0 },
  { label: "5+0 Blitz", tc: "5+0", class: "blitz", sec: 300, inc: 0 },
  { label: "5+3 Blitz", tc: "5+3", class: "blitz", sec: 300, inc: 3 },
  { label: "10+0 Rapid", tc: "10+0", class: "rapid", sec: 600, inc: 0 },
  { label: "10+5 Rapid", tc: "10+5", class: "rapid", sec: 600, inc: 5 },
  { label: "30+0 Classical", tc: "30+0", class: "classical", sec: 1800, inc: 0 },
];

export function ChallengeModal({
  opponentName,
  onClose,
  onSend,
}: {
  opponentName: string;
  onClose: () => void;
  onSend: (opts: {
    timeClass: TimeClass;
    timeControl: string;
    initialSeconds: number;
    incrementSeconds: number;
    isRated: boolean;
  }) => Promise<void>;
}) {
  const [pick, setPick] = useState(2);
  const [rated, setRated] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSend() {
    setSending(true);
    try {
      const t = TIME_CONTROLS[pick];
      await onSend({
        timeClass: t.class,
        timeControl: t.tc,
        initialSeconds: t.sec,
        incrementSeconds: t.inc,
        isRated: rated,
      });
      onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Challenge ${opponentName}`}
        className="surface-card w-full max-w-sm rounded-[22px] p-6 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-lg">
            <Swords className="h-5 w-5 text-gold" /> Challenge {opponentName}
          </div>
          <button
            onClick={onClose}
            aria-label="Close challenge dialog"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="text-xs uppercase tracking-[0.2em] text-gold/70" id="time-control-label">
          Time control
        </div>
        <div
          className="mt-3 grid grid-cols-3 gap-2"
          role="group"
          aria-labelledby="time-control-label"
        >
          {TIME_CONTROLS.map((t, i) => (
            <button
              key={t.tc + t.label}
              onClick={() => setPick(i)}
              aria-pressed={i === pick}
              className={`rounded-lg border px-2 py-1.5 text-xs transition ${
                i === pick
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-white/10 hover:border-gold/40"
              }`}
            >
              {t.tc}
            </button>
          ))}
        </div>

        <label className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={rated}
            onChange={(e) => setRated(e.target.checked)}
            className="h-4 w-4 rounded border-gold/30 accent-[var(--gold)]"
          />
          Rated match
        </label>

        <div className="mt-6 flex gap-3">
          <GoldButton onClick={handleSend} disabled={sending} className="flex-1">
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Swords className="h-4 w-4" />
            )}
            Send Challenge
          </GoldButton>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
        </div>
      </div>
    </div>
  );
}
