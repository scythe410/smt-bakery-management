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
