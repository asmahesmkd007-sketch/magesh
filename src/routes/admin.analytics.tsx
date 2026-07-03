import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({ meta: [{ title: "Admin — Analytics — ChessOx" }] }),
  component: () => (
    <AdminShell title="Analytics">
      <Analytics />
    </AdminShell>
  ),
});

const DAYS = 14;

function emptySeries() {
  const out: Record<string, { day: string; games: number; users: number; entries: number }> = {};
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out[key] = { day: key.slice(5), games: 0, users: 0, entries: 0 };
  }
  return out;
}

async function fetchDates(table: string, sinceIso: string): Promise<string[]> {
  const { data } = await (
    supabase as unknown as {
      from: (n: string) => {
        select: (s: string) => {
          gte: (c: string, v: string) => Promise<{ data: { created_at: string }[] | null }>;
        };
      };
    }
  )
    .from(table)
    .select("created_at")
    .gte("created_at", sinceIso);
  return (data ?? []).map((r) => r.created_at);
}

function Analytics() {
  const [series, setSeries] = useState<
    { day: string; games: number; users: number; entries: number }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - DAYS);
      const sinceIso = since.toISOString();
      const buckets = emptySeries();
      try {
        const [games, users] = await Promise.all([
          fetchDates("games", sinceIso),
          fetchDates("profiles", sinceIso),
        ]);
        const bump = (iso: string, key: "games" | "users" | "entries") => {
          const d = iso.slice(0, 10);
          if (buckets[d]) buckets[d][key] += 1;
        };
        games.forEach((d) => bump(d, "games"));
        users.forEach((d) => bump(d, "users"));
      } catch {
        /* ignore — show whatever loaded */
      }
      setSeries(Object.values(buckets));
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ChartCard title="Games Played (14d)" data={series} dataKey="games" color="#d4af37" />
      <ChartCard title="New Registrations (14d)" data={series} dataKey="users" color="#34d399" />
    </div>
  );
}

function ChartCard({
  title,
  data,
  dataKey,
  color,
}: {
  title: string;
  data: { day: string }[];
  dataKey: string;
  color: string;
}) {
  return (
    <Card className="p-5">
      <h3 className="mb-4 font-display text-lg">{title}</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="day" tick={{ fill: "#888", fontSize: 11 }} />
            <YAxis tick={{ fill: "#888", fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "#141414",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#g-${dataKey})`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
