// access.ts — the role → section access matrix (CLAUDE.md §5). Client-safe (no
// server-only, no DB): it's pure config, so BOTH the server gate
// (lib/auth.requireRole) and the client UI gate (bottom nav filtering) import
// the SAME source of truth. CLAUDE.md §5: enforced by RLS *and* UI gating.

import type { Database } from "@/lib/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type Section =
  | "dashboard"
  | "finance"
  | "expenses"
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
const STAFF_ONLY: readonly AppRole[] = ["staff"];

export const SECTION_ROLES: Record<Section, readonly AppRole[]> = {
  // Analytics / money — owner only (CLAUDE.md §5). These expose income /
  // revenue / net profit and stay owner-gated.
  dashboard: OWNER_ONLY,
  finance: OWNER_ONLY,
  reports: OWNER_ONLY,
  // Costs (not sales) — the STAFF-facing standalone Expenses ledger (CF5 hides
  // income, not costs). Owner records + views expenses inside Finance, so this
  // section is the staff-only surface and its nav item shows for staff alone.
  expenses: STAFF_ONLY,
  // Operational — all roles.
  inventory: ALL_ROLES,
  menu: ALL_ROLES,
  orders: ALL_ROLES,
  bookings: ALL_ROLES,
  // Admin — owner / manager.
  employees: OWNER_MANAGER,
  // Business / billing config — owner only.
  settings: OWNER_ONLY,
};

/** Roles allowed into a section — for both requireRole() and UI nav gating. */
export function rolesFor(section: Section): readonly AppRole[] {
  return SECTION_ROLES[section];
}

/** Does this role have access to the given section? (UI gating helper.) */
export function canAccess(role: AppRole, section: Section): boolean {
  return SECTION_ROLES[section].includes(role);
}
