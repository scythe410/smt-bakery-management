// Route-level loading UI (DESIGN.md §6): shown while the ingredient list is
// fetched on navigation. Reuses the shared shape-matched skeleton.

import { AuditSkeleton } from "@/components/inventory/audit-skeleton";

export default function AuditLoading() {
  return <AuditSkeleton />;
}
