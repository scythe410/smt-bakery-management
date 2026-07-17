// Zod schemas for the daily-payroll mutations. Validated server-side
// (CLAUDE.md §7.6). The client sends only the employee, the pay-day, and an
// optional bonus — never a base rate or a total: the server snapshots the
// employee's stored daily rate and computes base + bonus itself (CLAUDE.md §3).

import { z } from "zod";

/** A whole-rupee bonus cap (LKR 1,000,000) — generous, but bounds bad input. */
const MAX_BONUS_CENTS = 100_000_000;

export const approveSalarySchema = z
  .object({
    employeeId: z.string().uuid(),
    payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid date"),
    bonusCents: z.number().int().min(0).max(MAX_BONUS_CENTS),
  })
  .strict();

export type ApproveSalaryInput = z.infer<typeof approveSalarySchema>;

export const salaryPaymentIdSchema = z
  .object({
    paymentId: z.string().uuid(),
  })
  .strict();

export type SalaryPaymentIdInput = z.infer<typeof salaryPaymentIdSchema>;
