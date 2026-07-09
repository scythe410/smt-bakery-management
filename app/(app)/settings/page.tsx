// Settings (SPEC §4.4) — owner-only (business/billing config, CLAUDE.md §5). The
// server gate (requireRole → real 403 for manager/staff via app/forbidden.tsx)
// is defence-in-depth over RLS (the business UPDATE + tenant profile-read
// policies are also owner/manager-scoped). Sections stream behind a Suspense
// boundary after a shape-matched skeleton (DESIGN.md §6).
//
// Baseline pending client confirmation: business profile (+ logo upload to
// Storage), tax/currency config, notification preferences, user accounts
// (read-only), a WhatsApp Business API integration placeholder, and the default
// language. The per-user language switcher (P14) lives on this screen too.

import { Suspense } from "react";
import { requireRole, rolesFor } from "@/lib/auth";
import { SettingsData } from "@/components/settings/settings-data";
import { SettingsSkeleton } from "@/components/settings/settings-skeleton";

export default async function SettingsPage() {
  await requireRole(rolesFor("settings"));

  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsData />
    </Suspense>
  );
}
