import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Activity, Lock, Settings } from "lucide-react";

export interface SidebarSectionDef {
  key: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}

export function FriendsSidebar({
  sections,
  active,
  onChange,
}: {
  sections: SidebarSectionDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <nav aria-label="Friends navigation" className="lg:w-64 lg:shrink-0">
      <div className="royal-scroll surface-card flex gap-1.5 overflow-x-auto rounded-2xl p-2 lg:sticky lg:top-24 lg:flex-col lg:overflow-visible lg:p-3">
        {sections.map((s) => {
          const isActive = s.key === active;
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              onClick={() => onChange(s.key)}
              aria-current={isActive ? "page" : undefined}
              className={`group flex shrink-0 items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-all duration-200 lg:w-full ${
                isActive
                  ? "gradient-gold text-background shadow-gold-glow"
                  : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap lg:flex-1">{s.label}</span>
              {!!s.count && (
                <span
                  className={`grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1 text-[10px] font-semibold ${
                    isActive ? "bg-background/20 text-background" : "bg-gold/20 text-gold"
                  }`}
                >
                  {s.count > 99 ? "99+" : s.count}
                </span>
              )}
            </button>
          );
        })}

        <div className="my-1 hidden royal-divider lg:block" />

        <button
          disabled
          title="Coming soon"
          className="flex shrink-0 items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-medium text-muted-foreground/40 lg:w-full"
        >
          <Lock className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap lg:flex-1">Blocked Users</span>
          <span className="hidden text-[10px] uppercase tracking-wide lg:inline">Soon</span>
        </button>
        <button
          disabled
          title="Coming soon"
          className="flex shrink-0 items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-medium text-muted-foreground/40 lg:w-full"
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap lg:flex-1">Settings</span>
          <span className="hidden text-[10px] uppercase tracking-wide lg:inline">Soon</span>
        </button>
      </div>
    </nav>
  );
}
