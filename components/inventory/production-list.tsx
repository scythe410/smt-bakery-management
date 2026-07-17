// Production list — async server component. Loads the tenant's finished goods +
// production alerts + end-of-day leftovers (derived) and hands them to the client
// ProductionPanel, which renders the alerts, the per-item produce controls, and the
// leftover report with Return controls. The leftover cash VALUE is gated to the
// money-visibility role (owner), same gate as the stock-take revenue column
// (CLAUDE.md §5). Behind a Suspense boundary in the page so it streams in after a
// shape-matched skeleton.

import { requireProfile, canAccess } from "@/lib/auth";
import { getProductionView } from "@/lib/db/selectors/inventory";
import { ProductionPanel } from "@/components/inventory/production-panel";

export async function ProductionList() {
  const profile = await requireProfile();
  const view = await getProductionView();
  // Leftover value is a cash figure — same gate as the stock-take revenue column.
  const canSeeValue = canAccess(profile.role, "reports");
  return <ProductionPanel view={view} canSeeValue={canSeeValue} />;
}
