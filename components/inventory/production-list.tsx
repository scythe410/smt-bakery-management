// Production list — async server component. Loads the tenant's finished goods +
// production alerts (derived) and hands them to the client ProductionPanel, which
// renders the alerts and the per-item produce controls. Behind a Suspense boundary
// in the page so it streams in after a shape-matched skeleton.

import { getProductionView } from "@/lib/db/selectors/inventory";
import { ProductionPanel } from "@/components/inventory/production-panel";

export async function ProductionList() {
  const { items, alerts } = await getProductionView();
  return <ProductionPanel items={items} alerts={alerts} />;
}
