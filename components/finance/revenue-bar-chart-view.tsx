"use client";

// Revenue by Day (SPEC §3.2): one bar per day of the selected period, Y-axis in
// thousands ("18k", "14k"). Recharts (CLAUDE.md §2). Bars in brand red — the
// screen's one bold accent (DESIGN.md §2). Empty state when the period has no
// revenue. Values arrive as integer cents and are formatted at render.
//
// This is the Recharts-bearing view, kept in its own module so the ~230 KB
// library lands in a standalone chunk. It's never imported statically — only via
// the next/dynamic boundary in ./revenue-bar-chart (Antigravity HIGH-2), so
// Recharts loads on the client, on Finance › Overview, and nowhere else.

import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { formatLKR } from "@/lib/format";
import type { RevenueDay } from "@/lib/db/selectors/finance";

/** Cents → thousands-of-LKR axis label, e.g. 1_800_000 → "18k". */
function thousandsTick(cents: number): string {
  const k = cents / 100 / 1000;
  if (k === 0) return "0";
  return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
}

type Datum = RevenueDay & { day: string };

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Datum }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="border-border bg-surface shadow-card text-caption rounded-[var(--radius)] border px-2 py-1">
      <div className="text-muted">{d.date}</div>
      <div className="text-ink font-medium tabular-nums">{formatLKR(d.revenueCents)}</div>
    </div>
  );
}

export default function RevenueBarChartView({ data }: { data: RevenueDay[] }) {
  const { t } = useTranslation();
  const hasRevenue = data.some((d) => d.revenueCents > 0);
  const chartData: Datum[] = data.map((d) => ({ ...d, day: d.date.slice(8) }));

  return (
    <Card>
      <p className="text-caption text-muted tracking-wide uppercase">
        {t("finance.overview.revenueByDay")}
      </p>
      {hasRevenue ? (
        <div className="mt-3 h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                minTickGap={8}
              />
              <YAxis
                tickFormatter={thousandsTick}
                tickLine={false}
                axisLine={false}
                width={34}
                tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              />
              <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTooltip />} />
              <Bar
                dataKey="revenueCents"
                fill="var(--brand-red)"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-body text-muted mt-3">{t("finance.overview.noRevenue")}</p>
      )}
    </Card>
  );
}
