// Settings — owner-only (business/billing config, CLAUDE.md §5). This page is
// the canonical demonstration of server-side role gating: requireRole() returns
// a real 403 (via forbidden() → app/forbidden.tsx) for manager/staff, not just a
// hidden nav item. Full build lands in a later step.

import { getCurrentLanguage, requireRole, rolesFor } from "@/lib/auth";
import { getT } from "@/i18n/server";

export default async function SettingsPage() {
  await requireRole(rolesFor("settings"));
  const { t } = await getT(await getCurrentLanguage());

  return (
    <section className="flex flex-col gap-2">
      <h1 className="font-display text-h1 text-ink">{t("settings.title")}</h1>
      <p className="text-body text-muted">{t("settings.comingSoon")}</p>
    </section>
  );
}
