// Finance (SPEC §3.2) — owner-only (CLAUDE.md §5). requireRole() returns
// a real 403 for manager and staff (app/forbidden.tsx). Three tabs (Overview / Expenses /
// Platform Earnings) and the period selector live in the URL, so each selection
// is server-rendered from the derived selectors and is shareable. The active
// tab's data is fetched behind a Suspense boundary; its key includes the tab +
// period so it re-suspends (shows the skeleton) whenever the selection changes.

import { Suspense } from "react";
import { requireRole, rolesFor } from "@/lib/auth";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { PeriodSelector } from "@/components/finance/period-selector";
import { OverviewTab } from "@/components/finance/overview-tab";
import { ExpensesTab } from "@/components/finance/expenses-tab";
import { PlatformEarningsTab } from "@/components/finance/platform-earnings-tab";
import { FinanceTabSkeleton } from "@/components/finance/finance-skeleton";
import { periodInputFromParams } from "@/lib/finance/period-params";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(rolesFor("finance"));

  const sp = await searchParams;
  const tab = first(sp.tab) ?? "overview";
  const period = periodInputFromParams({
    period: first(sp.period),
    from: first(sp.from),
    to: first(sp.to),
  });

  // Re-suspend (skeleton) whenever the tab or period changes.
  const suspenseKey = `${tab}:${JSON.stringify(period)}`;

  return (
    <div className="flex flex-col gap-4">
      <FinanceTabs active={tab} />
      <PeriodSelector />
      <Suspense key={suspenseKey} fallback={<FinanceTabSkeleton />}>
        {tab === "expenses" ? (
          <ExpensesTab period={period} />
        ) : tab === "platform" ? (
          <PlatformEarningsTab period={period} />
        ) : (
          <OverviewTab period={period} />
        )}
      </Suspense>
    </div>
  );
}
