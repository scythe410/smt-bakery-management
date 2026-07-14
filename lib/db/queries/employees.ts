// queries/employees.ts — raw, tenant-scoped employee reads/writes (SPEC §4.3).

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { UpsertEmployeeInput } from "@/lib/zod/employees";

export type EmployeeRow = Database["public"]["Tables"]["employee"]["Row"];

export type ProfileOption = {
  id: string;
  name: string;
  role: string | null;
};

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

/** Profiles in this tenant not yet linked to any employee record. */
export async function listUnlinkedProfiles(): Promise<ProfileOption[]> {
  const supabase = await createClient();

  const [{ data: profiles }, { data: linked }] = await Promise.all([
    supabase.from("profile").select("id, name, role"),
    supabase.from("employee").select("profile_id").not("profile_id", "is", null),
  ]);

  const linkedIds = new Set((linked ?? []).map((e) => e.profile_id!));
  return (profiles ?? [])
    .filter((p) => !linkedIds.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, role: p.role }));
}

export async function insertEmployee(
  businessId: string,
  data: UpsertEmployeeInput,
): Promise<EmployeeRow> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("employee")
    .insert({
      business_id: businessId,
      name: data.name,
      role: data.role ?? null,
      salary_cents: data.salaryCents,
      profile_id: data.profileId,
      permissions: data.permissions,
      shift_schedule: data.shift,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return row;
}

export async function updateEmployee(
  id: string,
  businessId: string,
  data: UpsertEmployeeInput,
): Promise<EmployeeRow> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("employee")
    .update({
      name: data.name,
      role: data.role ?? null,
      salary_cents: data.salaryCents,
      profile_id: data.profileId,
      permissions: data.permissions,
      shift_schedule: data.shift,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error) throw error;
  return row;
}

export async function removeEmployee(id: string, businessId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("employee")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) throw error;
}
