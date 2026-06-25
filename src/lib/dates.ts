export function dateInDays(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

export function shortDate(n: number): string {
  return dateInDays(n).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export function relativeLabel(n: number): string {
  if (n < 0) return `${Math.abs(n)} days ago`;
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  return `In ${n} days`;
}
