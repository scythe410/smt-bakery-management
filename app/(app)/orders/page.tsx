// Orders (SPEC §3.4) — accessible to all roles (RLS: "order" is CRUD for
// owner/manager/staff, CLAUDE.md §5). The screen title lives in the shell header.
// The list + new-order menu are fetched behind a Suspense boundary so they stream
// in after a shape-matched skeleton (DESIGN.md §6).

import { Suspense } from "react";
import { requireProfile } from "@/lib/auth";
import { OrdersList } from "@/components/orders/orders-list";
import { OrdersSkeleton } from "@/components/orders/orders-skeleton";

export default async function OrdersPage() {
  await requireProfile();
  return (
    <Suspense fallback={<OrdersSkeleton />}>
      <OrdersList />
    </Suspense>
  );
}
