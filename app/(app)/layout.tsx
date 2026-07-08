// (app) shell layout. Server-side session check: requireProfile() redirects
// unauthenticated users to /login (CLAUDE.md §7.5). The resolved profile +
// business are handed to the client AppProvider so shell components read
// identity/role/business without re-fetching.
//
// The bottom navigation lands in a later step; for now the shell is the sticky
// header + the routed screen.

import { AppHeader } from "@/components/app/app-header";
import { AppProvider, type AppContextValue } from "@/components/app/app-provider";
import { getBusiness, requireProfile } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const business = await getBusiness();

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
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col">
        <AppHeader />
        <main className="flex-1 px-4 py-4">{children}</main>
      </div>
    </AppProvider>
  );
}
