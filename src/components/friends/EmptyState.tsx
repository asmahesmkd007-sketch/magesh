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
    <Card className="corner-ornaments p-10 text-center animate-in fade-in duration-300">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-gold/20 bg-gold/[0.04]">
        <Icon className="h-7 w-7 text-gold/40" />
      </div>
      <p className="mt-5 font-display text-lg text-foreground">{title}</p>
      {subtitle && (
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{subtitle}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}
