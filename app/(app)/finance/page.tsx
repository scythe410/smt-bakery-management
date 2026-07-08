// Finance — owner/manager only (CLAUDE.md §5). requireRole() returns a real 403
// for staff (app/forbidden.tsx); screen title from the shell header.

import { requireRole, rolesFor } from "@/lib/auth";
import { ComingSoon } from "@/components/app/coming-soon";

export default async function FinancePage() {
  await requireRole(rolesFor("finance"));
  return <ComingSoon />;
}
