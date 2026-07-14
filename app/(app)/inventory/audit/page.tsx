// Periodic ingredient audit (SPEC §3.3 / CLAUDE.md §4) — all roles may run the
// spot-count (inventory is all-roles). The screen title lives in the shell header.
// The ingredient list is fetched behind a Suspense boundary so it streams in after
// a shape-matched skeleton (DESIGN.md §6).

import { Suspense } from "react";
import { requireProfile } from "@/lib/auth";
import { AuditPanel } from "@/components/inventory/audit-panel";
import { AuditSkeleton } from "@/components/inventory/audit-skeleton";

export default async function AuditPage() {
  await requireProfile();
  return (
    <Suspense fallback={<AuditSkeleton />}>
      <AuditPanel />
    </Suspense>
  );
}
