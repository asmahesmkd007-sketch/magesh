import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

// Polymorphic button props: render as a <button> by default, or any element/
// component via `as` (e.g. an anchor), forwarding that element's native props.
type ButtonProps<E extends ElementType = "button"> = {
  children?: ReactNode;
  className?: string;
  as?: E;
} & Omit<ComponentPropsWithoutRef<E>, "as" | "className" | "children">;

export function PageShell({
  children,
  title,
  subtitle,
  eyebrow,
  action,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden pb-28 lg:pb-16">
      <div className="pointer-events-none absolute inset-0 bg-page" />
      <div className="pointer-events-none absolute inset-0 opacity-50 royal-grid" />
      <div className="pointer-events-none absolute left-0 top-28 h-72 w-72 rounded-full hero-spotlight blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
        {(title || eyebrow) && (
          <header className="mb-10 md:mb-12">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-3xl">
                {eyebrow && (
                  <div className="mb-3 text-[11px] uppercase tracking-[0.26em] text-gold/80">
                    {eyebrow}
                  </div>
                )}
                {title && (
                  <h1 className="text-4xl tracking-tight text-gradient-gold md:text-6xl">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground md:text-base">
                    {subtitle}
                  </p>
                )}
              </div>
              {action}
            </div>
            <div className="mt-8 royal-divider" />
          </header>
        )}
        {children}
      </div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`surface-card rounded-[22px] ${className}`}>{children}</div>;
}

export function Stat({
  label,
  value,
  hint,
  trend,
}: {
  label: string;
  value: string | number;
  hint?: string;
  trend?: "up" | "down";
}) {
  return (
    <Card className="corner-ornaments p-5 md:p-6">
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-3 flex items-end gap-2">
        <div className="font-stat text-3xl text-gradient-gold md:text-4xl">{value}</div>
        {trend && (
          <span className={`pb-1 text-xs ${trend === "up" ? "text-emerald" : "text-destructive"}`}>
            {trend === "up" ? "▲" : "▼"}
          </span>
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

export function GoldButton<E extends ElementType = "button">({
  children,
  className = "",
  as,
  ...rest
}: ButtonProps<E>) {
  const As = (as ?? "button") as ElementType;
  return (
    <As
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl gradient-gold px-5 py-2.5 text-sm font-medium text-background shadow-gold-glow transition duration-200 hover:brightness-110 ${className}`}
    >
      {children}
    </As>
  );
}

export function EmeraldButton<E extends ElementType = "button">({
  children,
  className = "",
  as,
  ...rest
}: ButtonProps<E>) {
  const As = (as ?? "button") as ElementType;
  return (
    <As
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl gradient-emerald px-5 py-2.5 text-sm font-medium text-ivory shadow-soft transition duration-200 hover:brightness-110 ${className}`}
    >
      {children}
    </As>
  );
}

export function GhostButton<E extends ElementType = "button">({
  children,
  className = "",
  as,
  ...rest
}: ButtonProps<E>) {
  const As = (as ?? "button") as ElementType;
  return (
    <As
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-gold/25 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-gold/40 hover:bg-white/[0.05] ${className}`}
    >
      {children}
    </As>
  );
}

export function SectionTitle({
  kicker,
  title,
  action,
}: {
  kicker?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {kicker && (
          <div className="text-[11px] uppercase tracking-[0.24em] text-gold/70">{kicker}</div>
        )}
        <h2 className="mt-2 text-2xl tracking-tight text-foreground md:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Pill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "gold" | "emerald" | "muted";
}) {
  const tones: Record<string, string> = {
    default: "royal-chip",
    gold: "border-gold/30 bg-gold/10 text-gold",
    emerald: "border-emerald/30 bg-emerald/10 text-emerald",
    muted: "border-white/10 bg-white/[0.03] text-muted-foreground",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
