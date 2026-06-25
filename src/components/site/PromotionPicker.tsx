const GLYPHS: Record<"w" | "b", Record<string, string>> = {
  w: { q: "♕", r: "♖", b: "♗", n: "♘" },
  b: { q: "♛", r: "♜", b: "♝", n: "♞" },
};

type Props = {
  color: "w" | "b";
  onPick: (piece: "q" | "r" | "b" | "n") => void;
  onCancel: () => void;
};

export function PromotionPicker({ color, onPick, onCancel }: Props) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center rounded-[30px] bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="rounded-2xl border border-gold/40 bg-background/95 p-4 shadow-luxe" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 text-center font-display text-xs uppercase tracking-[0.3em] text-gold">Promote to</div>
        <div className="flex gap-2">
          {(["q", "r", "b", "n"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPick(p)}
              className="grid h-14 w-14 place-items-center rounded-xl border border-gold/30 bg-white/[0.04] text-4xl text-foreground transition-colors hover:border-gold hover:bg-gold/15"
            >
              {GLYPHS[color][p]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
