// Route-level loading UI (DESIGN.md §6): shown while the Production payload is
// fetched on navigation. Reuses the shared shape-matched skeleton.

import { ProductionSkeleton } from "@/components/inventory/production-skeleton";

export default function ProductionLoading() {
  return <ProductionSkeleton />;
}
