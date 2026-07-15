// Zod schema for the mark-employee-paid mutation. Validated server-side
// (CLAUDE.md §7.6). employeeId and paid arrive as typed args from the client
// action call; the schema rejects unexpected shapes.

import { z } from "zod";

export const markEmployeePaidSchema = z
  .object({
    employeeId: z.string().uuid(),
    paid: z.boolean(),
  })
  .strict();

export type MarkEmployeePaidInput = z.infer<typeof markEmployeePaidSchema>;

export const upsertEmployeeSchema = z
  .object({
    name: z.string().min(1).max(100),
    role: z.string().max(100).optional(),
    salaryCents: z.number().int().min(0).nullable(),
    profileId: z.string().uuid().nullable(),
    // The app-access role to sync onto the linked account (owner-only). Only
    // meaningful when profileId is set; ignored server-side when unlinked.
    accessRole: z.enum(["owner", "manager", "staff"]).nullable(),
    permissions: z.record(z.string(), z.boolean()),
    shift: z.record(z.string(), z.string()),
  })
  .strict();

export type UpsertEmployeeInput = z.infer<typeof upsertEmployeeSchema>;

export const deleteEmployeeSchema = z
  .object({
    employeeId: z.string().uuid(),
  })
  .strict();

export type DeleteEmployeeInput = z.infer<typeof deleteEmployeeSchema>;
