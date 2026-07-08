// Finance › Platform Earnings (SPEC §3.2). Server component. Re-asserts the
// Finance role gate (owner/manager) as defence in depth — the route already
// gates it, and commission_rule RLS blocks staff from the underlying data
// entirely. Loads the per-source commission and hands it to the client table.

import { requireRole, rolesFor } from "@/lib/auth";
import { getPlatformEarnings } from "@/lib/db/selectors/finance";
import { PlatformEarningsTable } from "@/components/finance/platform-earnings-table";
import type { PeriodInput } from "@/lib/db/period";

export async function PlatformEarningsTab({ period }: { period: PeriodInput }) {
  await requireRole(rolesFor("finance"));
  const earnings = await getPlatformEarnings(period);
  return (
    <PlatformEarningsTable
      rows={earnings.rows}
      totalCommissionCents={earnings.totalCommissionCents}
    />
  );
}
