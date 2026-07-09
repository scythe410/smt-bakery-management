// queries/employees.ts — raw, tenant-scoped employee reads (SPEC §4.3).
//
// Reads go through the RLS-scoped server client (anon key). The `employee` table
// is owner/manager-only at the database (migration 002: staff has NO policy, so
// staff SELECT returns zero rows) — this query inherits that; the page also gates
// with requireRole(). No derivation here: rows in, rows out. Shaping (parsing the
// shift/permissions jsonb) lives in lib/db/selectors/employees.ts.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type EmployeeRow = Database["public"]["Tables"]["employee"]["Row"];

/** All employees for this tenant, ordered by name (A→Z). */
export async function listEmployees(): Promise<EmployeeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
