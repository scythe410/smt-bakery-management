// Settings — owner-only (business/billing config, CLAUDE.md §5). The server gate
// (requireRole → real 403 for manager/staff via app/forbidden.tsx) is the point;
// the screen title is rendered by the shell header. Full build lands later.

import { requireRole, rolesFor } from "@/lib/auth";
import { ComingSoon } from "@/components/app/coming-soon";

export default async function SettingsPage() {
  await requireRole(rolesFor("settings"));
  return <ComingSoon messageKey="settings.comingSoon" />;
}
