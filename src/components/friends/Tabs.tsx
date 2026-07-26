export interface FriendTabDef {
  key: string;
  label: string;
  count?: number;
  icon: React.ComponentType<{ className?: string }>;
}

export function FriendTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: FriendTabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="mb-8 flex flex-wrap gap-2 rounded-2xl border border-white/5 bg-white/[0.02] p-1.5 sm:inline-flex">
      {tabs.map((t) => {
        const isActive = t.key === active;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
              isActive
                ? "gradient-gold text-background shadow-gold-glow"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
            {!!t.count && (
              <span
                className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-semibold ${
                  isActive ? "bg-background/20 text-background" : "bg-gold/20 text-gold"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
