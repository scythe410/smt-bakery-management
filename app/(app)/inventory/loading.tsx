// Route-level loading UI (DESIGN.md §6): shown while the Inventory payload is
// fetched on navigation. Reuses the shared shape-matched skeleton.

import { InventorySkeleton } from "@/components/inventory/inventory-skeleton";

export default function InventoryLoading() {
  return <InventorySkeleton />;
}
