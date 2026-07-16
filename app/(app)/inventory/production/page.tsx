// Production (finished-good lane, CLAUDE.md §4 FT3) — produce batches of items the
// bakery makes and sells from stock, and see reorder alerts. Operational: all roles
// may access (inventory is all-roles, §5); no revenue is shown. The list streams in
// behind a Suspense boundary after a shape-matched skeleton (DESIGN.md §6).

import { Suspense } from "react";
import { requireProfile } from "@/lib/auth";
import { ProductionList } from "@/components/inventory/production-list";
import { ProductionSkeleton } from "@/components/inventory/production-skeleton";

export default async function ProductionPage() {
  await requireProfile();
  return (
    <Suspense fallback={<ProductionSkeleton />}>
      <ProductionList />
    </Suspense>
  );
}
