import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/site/Primitives";

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="corner-ornaments animate-rise-in relative overflow-hidden p-10 text-center sm:p-14">
      <div className="pointer-events-none absolute inset-0 opacity-40 royal-grid" />
      <div className="relative">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-gold/20 bg-gold/[0.04] shadow-gold-glow/20">
          <Icon className="h-8 w-8 text-gold/50 animate-float" />
        </div>
        <p className="mt-6 font-display text-xl text-foreground">{title}</p>
        {subtitle && (
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        )}
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    </Card>
  );
}
