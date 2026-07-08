// Zod schemas for profile mutations. Validated server-side (CLAUDE.md §7.6).

import { z } from "zod";
import { languages } from "@/i18n/config";

// languages is a readonly tuple ("en" | "si"); spread into a mutable tuple for
// z.enum. The freeze trigger (migration 001) already blocks id/business_id/role,
// so language_pref is the only profile field a client may set here.
export const languagePrefSchema = z.enum([...languages]);
