// Route-level loading UI (DESIGN.md §6): shown while the stock-take session is
// fetched on navigation. Reuses the shared shape-matched skeleton.

import { StockTakeSkeleton } from "@/components/inventory/stock-take-skeleton";

export default function StockTakeLoading() {
  return <StockTakeSkeleton />;
}
