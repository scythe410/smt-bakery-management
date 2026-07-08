"use client";

// App shell context — the server-loaded profile + business, made available to
// any Client Component in the (app) shell via useAppContext(). The (app) layout
// resolves these server-side (RLS-scoped) and passes a serializable subset in;
// components read identity/role/business here without re-fetching.

import { createContext, useContext } from "react";
import type { Language } from "@/i18n/config";
import type { Database } from "@/lib/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export type AppContextValue = {
  profile: {
    id: string;
    name: string;
    role: AppRole;
    language_pref: Language;
  };
  business: {
    id: string;
    name: string;
    logo_url: string | null;
  } | null;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  value,
  children,
}: {
  value: AppContextValue;
  children: React.ReactNode;
}) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (ctx === null) {
    throw new Error("useAppContext must be used within <AppProvider> (the (app) shell).");
  }
  return ctx;
}
