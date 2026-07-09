// Reports (SPEC §3.5) — owner/manager only (CLAUDE.md §5). requireRole() returns
// a real 403 for staff (app/forbidden.tsx). The report type + date live in the
// URL, so each selection is server-rendered from the derived selector and is
// shareable. The date defaults to the tenant's current day (resolved in its own
// timezone, so "today" means today for the shop). The report body is fetched
// behind a Suspense boundary keyed on type + date, so it re-suspends (shows the
// skeleton) whenever the selection changes.

import { Suspense } from "react";
import { requireRole, rolesFor } from "@/lib/auth";
import { resolveTenantPeriod } from "@/lib/db/selectors/context";
import { ReportControls } from "@/components/reports/report-controls";
import { DailySalesReport } from "@/components/reports/daily-sales-report";
import { ReportsSkeleton } from "@/components/reports/reports-skeleton";
import { isDateStr, toReportType } from "@/lib/reports/report-params";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(rolesFor("reports"));

  const sp = await searchParams;
  const reportType = toReportType(first(sp.type));

  const dateParam = first(sp.date);
  // Default to the tenant's current calendar day (its timezone), so an empty URL
  // still lands on a concrete, correct "today" for the shop.
  const date = isDateStr(dateParam)
    ? dateParam
    : (await resolveTenantPeriod({ kind: "today" })).startDate;

  // Re-suspend (skeleton) whenever the report type or date changes.
  const suspenseKey = `${reportType}:${date}`;

  return (
    <div className="flex flex-col gap-4">
      <ReportControls reportType={reportType} date={date} />
      <Suspense key={suspenseKey} fallback={<ReportsSkeleton />}>
        <DailySalesReport reportType={reportType} date={date} />
      </Suspense>
    </div>
  );
}
