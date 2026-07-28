import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/site/Primitives";

export interface DashboardStatDef {
  key: string;
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: "gold" | "emerald";
}

export function DashboardStats({ stats }: { stats: DashboardStatDef[] }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((s, i) => (
        <Card
          key={s.key}
          style={{ animationDelay: `${i * 40}ms` }}
          className="animate-rise-in flex items-center gap-3 p-4"
        >
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
              s.tone === "gold"
                ? "bg-gold/10 text-gold"
                : s.tone === "emerald"
                  ? "bg-emerald/10 text-emerald"
                  : "bg-white/5 text-muted-foreground"
            }`}
          >
            <s.icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="font-stat text-lg leading-none text-foreground">{s.value}</div>
            <div className="mt-1 truncate text-[10px] uppercase tracking-wider text-muted-foreground">
              {s.label}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
