// Daily merchandise stock-take (SPEC §3.3 / CLAUDE.md §4) — all roles may run the
// count (inventory is all-roles); revenue is gated inside the panel. The screen
// title lives in the shell header. Operates on the tenant's current calendar day
// (resolved in its own timezone). The session is fetched behind a Suspense
// boundary so it streams in after a shape-matched skeleton (DESIGN.md §6).

import { Suspense } from "react";
import { requireProfile } from "@/lib/auth";
import { resolveTenantPeriod } from "@/lib/db/selectors/context";
import { StockTakePanel } from "@/components/inventory/stock-take-panel";
import { StockTakeSkeleton } from "@/components/inventory/stock-take-skeleton";

export default async function StockTakePage() {
  await requireProfile();
  const today = (await resolveTenantPeriod({ kind: "today" })).startDate;
  return (
    <Suspense fallback={<StockTakeSkeleton />}>
      <StockTakePanel date={today} />
    </Suspense>
  );
}
