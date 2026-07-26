// Column 1 — the chat filter selector. Three modes: Global (permanent
// rooms), Public Rooms, Private Rooms. Switching updates Column 2
// instantly — pure client-side state, no navigation/reload.
export type ChatFilter = "global" | "public" | "private";

const TABS: { value: ChatFilter; label: string; icon: string }[] = [
  { value: "global", label: "Global", icon: "🌍" },
  { value: "public", label: "Public Rooms", icon: "🌐" },
  { value: "private", label: "Private Rooms", icon: "🔒" },
];

export function ChatFilterTabs({
  value,
  onChange,
}: {
  value: ChatFilter;
  onChange: (v: ChatFilter) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium transition ${
            value === tab.value
              ? "bg-gold/15 text-gold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="mr-1">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
