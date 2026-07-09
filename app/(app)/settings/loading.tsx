// Route-level loading UI (DESIGN.md §6): shown while the Settings payload is
// fetched on navigation. Reuses the shared shape-matched skeleton.

import { SettingsSkeleton } from "@/components/settings/settings-skeleton";

export default function SettingsLoading() {
  return <SettingsSkeleton />;
}
