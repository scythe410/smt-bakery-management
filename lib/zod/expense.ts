// Zod schema for the add-expense mutation. Validated server-side (CLAUDE.md §7.6);
// business_id / created_by are NEVER taken from the client — the action sets them
// from the authenticated profile. Amount arrives in major units (rupees) and is
// converted to integer cents in the action (lib/money.toCents) — no float money
// is ever stored (CLAUDE.md §3).

import { z } from "zod";

export const addExpenseSchema = z.object({
  // Local calendar date `YYYY-MM-DD`.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().trim().min(1).max(60),
  // Major-unit amount (rupees). Coerced from the form string; must be positive.
  amountMajor: z.coerce.number().positive().finite().max(1_000_000_000),
  note: z.string().trim().max(500).optional(),
});

export type AddExpenseInput = z.infer<typeof addExpenseSchema>;
