// Split out of routes/profile.tsx so `recharts` (~441 KB raw / ~100 KB
// brotli, the second-largest chunk in the app) is no longer part of the
// profile route's initial payload. The card sits below the fold and its
// data is client-fetched, so nothing is lost by loading it on demand —
// see LazyRatingProgressChart for the gate.
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type RatingPoint = { day: string; rating: number };

export default function RatingProgressChart({ data }: { data: RatingPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d4af37" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#d4af37" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          domain={["dataMin - 20", "dataMax + 20"]}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(16,8,8,0.95)",
            border: "1px solid rgba(212,175,55,0.3)",
            borderRadius: 12,
            fontSize: 12,
          }}
          labelStyle={{ color: "#d4af37" }}
        />
        <Area
          type="monotone"
          dataKey="rating"
          stroke="#d4af37"
          strokeWidth={2}
          fill="url(#goldFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
