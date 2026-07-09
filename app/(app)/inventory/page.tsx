// Inventory (SPEC §3.3) — accessible to all roles (RLS: inventory is CRUD for
// owner/manager/staff, CLAUDE.md §5). The screen title lives in the shell header.
// The list is fetched behind a Suspense boundary so it streams in after a
// shape-matched skeleton (DESIGN.md §6).

import { Suspense } from "react";
import { requireProfile } from "@/lib/auth";
import { InventoryList } from "@/components/inventory/inventory-list";
import { InventorySkeleton } from "@/components/inventory/inventory-skeleton";

export default async function InventoryPage() {
  await requireProfile();
  return (
    <Suspense fallback={<InventorySkeleton />}>
      <InventoryList />
    </Suspense>
  );
}
