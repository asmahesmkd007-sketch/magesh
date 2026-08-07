import { useState } from "react";
import type { ChatReportReason } from "@/lib/api/chatClient";

const REASONS: { value: ChatReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "abuse", label: "Abuse" },
  { value: "harassment", label: "Harassment" },
  { value: "fake_information", label: "Fake information" },
  { value: "other", label: "Other" },
];

export function ReportDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (reason: ChatReportReason, details?: string) => void;
}) {
  const [reason, setReason] = useState<ChatReportReason>("spam");
  const [details, setDetails] = useState("");
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-[#101317] p-5 shadow-luxe"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-medium">Report message</h3>
        <div className="mt-3 space-y-1.5">
          {REASONS.map((r) => (
            <label key={r.value} className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="radio"
                name="chat-report-reason"
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="accent-[#D4AF37]"
              />
              {r.label}
            </label>
          ))}
        </div>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Additional details (optional)"
          rows={2}
          className="mt-3 w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs outline-none focus:border-gold/40"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(reason, details.trim() || undefined)}
            className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/30"
          >
            Submit report
          </button>
        </div>
      </div>
    </div>
  );
}
