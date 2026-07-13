"use client";

// Code-splitting boundary for the Revenue-by-Day chart (Antigravity HIGH-2).
// Recharts (~230 KB) is the heaviest client dependency and is only ever rendered
// here, on Finance › Overview. Loading the actual chart (./revenue-bar-chart-view)
// via next/dynamic with `ssr: false` keeps Recharts out of the server-rendered
// and shared bundles entirely — it's fetched on the client only once this mounts,
// behind a skeleton that matches the chart card's shape (DESIGN.md §6). The public
// <RevenueBarChart> API is unchanged, so Finance › Overview imports it as before.

import dynamic from "next/dynamic";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import type { RevenueDay } from "@/lib/db/selectors/finance";

// Skeleton stand-in while the Recharts chunk loads: the same card + label, with a
// row of faux bars in place of the chart (never a bare spinner — DESIGN.md §6).
function ChartSkeleton() {
  const { t } = useTranslation();
  const heights = ["h-24", "h-32", "h-20", "h-40", "h-28", "h-36", "h-16"];
  return (
    <Card>
      <p className="text-caption text-muted tracking-wide uppercase">
        {t("finance.overview.revenueByDay")}
      </p>
      <div
        className="mt-3 flex h-52 animate-pulse items-end justify-between gap-1.5 pt-2"
        aria-hidden
      >
        {heights.map((h, i) => (
          <span key={i} className={`bg-border w-full rounded-t ${h}`} />
        ))}
      </div>
    </Card>
  );
}

const RevenueBarChartView = dynamic(() => import("./revenue-bar-chart-view"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export function RevenueBarChart({ data }: { data: RevenueDay[] }) {
  return <RevenueBarChartView data={data} />;
}
