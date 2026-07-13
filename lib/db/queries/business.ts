// queries/business.ts — the tenant row, cached across requests.
//
// The business row (name, logo, timezone, tax config) changes only via Settings,
// yet the shell reads it on every load and every selector reads its timezone to
// resolve periods. So we cache it per business_id and invalidate on a Settings
// write (`business:{id}` tag). Identity is resolved BEFORE this call — the id is
// the caller's own `profile.business_id` (RLS-read), so the service-client read
// here is still strictly tenant-scoped (see lib/supabase/service.ts).

import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { businessTags } from "@/lib/db/cache";
import type { Database } from "@/lib/supabase/types";

type BusinessRow = Database["public"]["Tables"]["business"]["Row"];

/** The business row for `businessId`, cached until a Settings write invalidates it. */
export function getCachedBusinessRow(businessId: string): Promise<BusinessRow | null> {
  return unstable_cache(
    async (): Promise<BusinessRow | null> => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("business")
        .select("*")
        .eq("id", businessId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    ["business-row", businessId],
    { tags: [businessTags.business(businessId)], revalidate: 3600 },
  )();
}
