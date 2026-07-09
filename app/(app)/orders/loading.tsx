// Route-level loading UI (DESIGN.md §6): shown while the Orders payload is
// fetched on navigation. Reuses the shared shape-matched skeleton.

import { OrdersSkeleton } from "@/components/orders/orders-skeleton";

export default function OrdersLoading() {
  return <OrdersSkeleton />;
}
