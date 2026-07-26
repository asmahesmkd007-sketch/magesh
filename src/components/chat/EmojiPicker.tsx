// Minimal fixed emoji-reaction picker — deliberately small, per the "keep
// the interface clean, avoid unnecessary options" spec (no full emoji
// keyboard, no skin-tone picker).
import { useEffect, useRef } from "react";

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "♟️", "🏆"];

export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-8 z-30 flex gap-1 rounded-full border border-white/10 bg-[#101317] p-1.5 shadow-luxe"
    >
      {EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className="grid h-7 w-7 place-items-center rounded-full text-base hover:bg-white/[0.08]"
        >
          {e}
        </button>
      ))}
    </div>
  );
}
