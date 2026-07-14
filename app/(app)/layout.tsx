// (app) shell layout. Server-side session check: requireProfile() redirects
// unauthenticated users to /login (CLAUDE.md §7.5). Profile + business are handed
// to the client AppProvider so shell components read identity/role/business
// without re-fetching; live badge counts are computed server-side (RLS-scoped)
// and passed to the header (unread bell) and the bottom nav (Inventory / Menu).

import { AppHeader } from "@/components/app/app-header";
import { AppProvider, type AppContextValue } from "@/components/app/app-provider";
import { BottomNav } from "@/components/nav/bottom-nav";
import { getBusiness, requireProfile } from "@/lib/auth";
import { getShellBadges } from "@/lib/db/selectors/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const business = await getBusiness();
  const badges = await getShellBadges();

  const context: AppContextValue = {
    profile: {
      id: profile.id,
      name: profile.name,
      role: profile.role,
      language_pref: profile.language_pref,
    },
    business: business
      ? { id: business.id, name: business.name, logo_url: business.logo_url }
      : null,
  };

  return (
    <AppProvider value={context}>
      <div className="bg-surface mx-auto flex min-h-dvh max-w-[430px] flex-col">
        {/* print:hidden — only the receipt content prints, not app chrome. */}
        <div className="print:hidden">
          <AppHeader unreadCount={badges.notificationsUnread} />
        </div>
        {/* Bottom padding clears the fixed nav (~64px) plus the iOS safe area.
            On print the nav is hidden so print:pb-4 removes the excess gap. */}
        <main className="flex-1 px-4 py-4 pb-[calc(72px+env(safe-area-inset-bottom))] print:pb-4">
          {children}
        </main>
        <div className="print:hidden">
          <BottomNav badges={badges} />
        </div>
      </div>
    </AppProvider>
  );
}
