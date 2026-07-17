// queries/employees.ts — raw, tenant-scoped employee reads/writes (SPEC §4.3).

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { UpsertEmployeeInput } from "@/lib/zod/employees";

export type EmployeeRow = Database["public"]["Tables"]["employee"]["Row"];
export type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * A login account an owner may link to an employee. `role` is the current
 * app-access role (owner/manager/staff); `linkedEmployeeId` is the employee it
 * is already linked to, or null when free to link.
 */
export type LinkableAccount = {
  id: string;
  email: string;
  role: AppRole;
  linkedEmployeeId: string | null;
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

/**
 * The login accounts in this tenant that an owner may link (owner-only at the
 * database via the SECURITY DEFINER RPC — returns empty for any other role).
 * Each carries its email + current access role and, if already linked, the
 * employee id so the edit form can keep showing the currently-linked account.
 */
export async function listLinkableAccounts(): Promise<LinkableAccount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_linkable_accounts");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email ?? "",
    role: row.role,
    linkedEmployeeId: row.linked_employee_id ?? null,
  }));
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
      daily_pay_cents: data.dailyPayCents,
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
      daily_pay_cents: data.dailyPayCents,
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
