import { ReactNode } from "react";
import { X } from "lucide-react";
import { GoldButton, GhostButton } from "./Primitives";

type ConfirmModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  icon?: ReactNode;
  variant?: "danger" | "gold";
};

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  icon,
  variant = "gold",
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm rounded-2xl border border-gold/30 bg-[#0C0E12]/95 p-6 shadow-2xl shadow-gold/20 animate-in zoom-in-95 duration-200 text-center">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {icon && <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 text-gold border border-gold/20">{icon}</div>}

        <h3 className="font-display text-xl font-bold uppercase tracking-wide text-gradient-gold">
          {title}
        </h3>

        <p className="mt-2 text-xs font-medium text-muted-foreground leading-relaxed">
          {description}
        </p>

        <div className="mt-6 flex items-center gap-3">
          <GhostButton
            onClick={onClose}
            className="flex-1 border border-white/10 text-xs py-2.5"
          >
            {cancelText}
          </GhostButton>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 rounded-xl py-2.5 px-4 font-display text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-md ${
              variant === "danger"
                ? "bg-gradient-to-r from-red-600 to-amber-700 text-white hover:from-red-500 hover:to-amber-600 shadow-red-900/30"
                : "bg-gradient-to-r from-gold to-amber-500 text-black hover:brightness-110 shadow-gold/20"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
