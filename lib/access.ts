// access.ts — the role → section access matrix (CLAUDE.md §5). Client-safe (no
// server-only, no DB): it's pure config, so BOTH the server gate
// (lib/auth.requireRole) and the client UI gate (bottom nav filtering) import
// the SAME source of truth. CLAUDE.md §5: enforced by RLS *and* UI gating.

import type { Database } from "@/lib/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type Section =
  | "dashboard"
  | "finance"
  | "inventory"
  | "menu"
  | "orders"
  | "bookings"
  | "employees"
  | "reports"
  | "settings";

const ALL_ROLES: readonly AppRole[] = ["owner", "manager", "staff"];
const OWNER_MANAGER: readonly AppRole[] = ["owner", "manager"];
const OWNER_ONLY: readonly AppRole[] = ["owner"];

export const SECTION_ROLES: Record<Section, readonly AppRole[]> = {
  dashboard: ALL_ROLES,
  inventory: ALL_ROLES,
  menu: ALL_ROLES,
  orders: ALL_ROLES,
  bookings: ALL_ROLES,
  finance: OWNER_MANAGER,
  reports: OWNER_MANAGER,
  employees: OWNER_MANAGER,
  settings: OWNER_ONLY, // business/billing config — owner only
};

/** Roles allowed into a section — for both requireRole() and UI nav gating. */
export function rolesFor(section: Section): readonly AppRole[] {
  return SECTION_ROLES[section];
}

/** Does this role have access to the given section? (UI gating helper.) */
export function canAccess(role: AppRole, section: Section): boolean {
  return SECTION_ROLES[section].includes(role);
}
