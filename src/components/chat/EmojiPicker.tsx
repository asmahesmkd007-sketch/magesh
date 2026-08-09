// Minimal fixed emoji-reaction picker — clean grid popover for chat & composer.
import { useEffect, useRef } from "react";

const EMOJIS = [
  "👍", "❤️", "😂", "😮", "😢", "🔥", "♟️", "🏆",
  "😎", "👏", "🤝", "🙌", "🎉", "⚡", "🧠", "🎯",
];

export function EmojiPicker({
  onPick,
  onClose,
  align = "left",
  position = "top",
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  align?: "left" | "right";
  position?: "top" | "bottom";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Small timeout ensures touch/tap event opening the picker doesn't immediately close it
    const timer = setTimeout(() => {
      const handleOutsideClick = (e: Event) => {
        if (ref.current && !ref.current.contains(e.target as Node)) {
          onClose();
        }
      };

      document.addEventListener("pointerdown", handleOutsideClick);
      document.addEventListener("mousedown", handleOutsideClick);
    }, 50);

    return () => clearTimeout(timer);
  }, [onClose]);

  const alignClass = align === "left" ? "left-0" : "right-0";
  const posClass = position === "top" ? "bottom-full mb-2" : "top-full mt-2";

  return (
    <div
      ref={ref}
      className={`absolute ${alignClass} ${posClass} z-50 grid grid-cols-8 gap-1 rounded-2xl border border-white/15 bg-[#14171d] p-2 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 min-w-[260px]`}
    >
      {EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            onPick(e);
          }}
          className="grid h-8 w-8 place-items-center rounded-xl text-lg transition-transform hover:scale-125 hover:bg-white/10 active:scale-95"
        >
          {e}
        </button>
      ))}
    </div>
  );
}

