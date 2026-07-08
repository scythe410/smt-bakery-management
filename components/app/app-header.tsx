// App shell header (server component). Sticky top bar per DESIGN.md §4 — logo +
// greeting on the left, sign-out on the right. The notification bell and full
// screen title land in a later step; this is the minimal authenticated chrome.

import { Logo } from "@/components/ui/logo";
import { SignOutButton } from "@/components/app/sign-out-button";
import { getBusiness, getCurrentLanguage, requireProfile } from "@/lib/auth";
import { getT } from "@/i18n/server";

export async function AppHeader() {
  const profile = await requireProfile();
  const business = await getBusiness();
  const { t } = await getT(await getCurrentLanguage());

  return (
    <header className="border-border bg-surface sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-4 py-3">
      <div className="flex items-center gap-3">
        <Logo name={business?.name ?? "SB"} size="sm" />
        <span className="text-h2 text-ink">{t("shell.greeting", { name: profile.name })}</span>
      </div>
      <SignOutButton label={t("shell.signOut")} />
    </header>
  );
}
