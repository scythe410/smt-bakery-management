// Settings — owner-only (business/billing config, CLAUDE.md §5). The server gate
// (requireRole → real 403 for manager/staff via app/forbidden.tsx) is the point;
// the screen title is rendered by the shell header. The Language section (SPEC
// §5.2) ships now — it persists to the caller's own profile.language_pref; the
// rest of the business/billing settings land in a later step.

import { requireRole, rolesFor } from "@/lib/auth";
import { LanguageSetting } from "@/components/settings/language-setting";

export default async function SettingsPage() {
  await requireRole(rolesFor("settings"));

  return (
    <div className="flex flex-col gap-4">
      <LanguageSetting />
    </div>
  );
}
