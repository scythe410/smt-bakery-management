// Reports (SPEC §3.5) — owner-only (CLAUDE.md §5). requireRole() returns
// a real 403 for manager and staff (app/forbidden.tsx). The report type + date live in the
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
import { EndOfDayReport } from "@/components/reports/end-of-day-report";
import { SalariesReport } from "@/components/reports/salaries-report";
import { ReportsSkeleton } from "@/components/reports/reports-skeleton";
import { isDateStr, toReportType, toSalaryRange } from "@/lib/reports/report-params";

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

  // Salaries is reviewed over a window (Day/Week/Month/Custom); the others report a
  // single day. Range + explicit custom from/to live in the URL alongside the anchor.
  const range = toSalaryRange(first(sp.range));
  const fromParam = first(sp.from);
  const toParam = first(sp.to);
  const from = isDateStr(fromParam) ? fromParam : undefined;
  const to = isDateStr(toParam) ? toParam : undefined;

  // Re-suspend (skeleton) whenever the report type, date, or salary window changes.
  const suspenseKey = `${reportType}:${date}:${range}:${from ?? ""}:${to ?? ""}`;

  return (
    <div className="flex flex-col gap-4">
      <ReportControls
        reportType={reportType}
        date={date}
        range={range}
        from={from}
        to={to}
      />
      <Suspense key={suspenseKey} fallback={<ReportsSkeleton />}>
        {reportType === "end_of_day" ? (
          <EndOfDayReport date={date} />
        ) : reportType === "salaries" ? (
          <SalariesReport range={range} date={date} from={from} to={to} />
        ) : (
          <DailySalesReport reportType={reportType} date={date} />
        )}
      </Suspense>
    </div>
  );
}
