// Zod schemas for the stock-take + ingredient-audit mutations. Validated
// server-side (CLAUDE.md §7.6); business_id is NEVER taken from the client — the
// RPCs/actions resolve it from the session. Money (unit price) arrives in major
// units (rupees) and is converted to integer cents server-side (lib/money.toCents)
// — no float money is stored (CLAUDE.md §3). Quantities are non-negative decimals
// (numeric(12,3) in the DB). Ids use z.guid() (accepts the seed's vanity UUIDs,
// like the order schema — see LOG 2026-07-12); the RPCs re-check tenancy + kind.

import { z } from "zod";

const qty = z.coerce.number().min(0).finite().max(1_000_000_000);
const priceMajor = z.coerce.number().min(0).finite().max(1_000_000_000);

/** Open today's merchandise count: opening qty + snapshot selling price per line. */
export const openStockDaySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    lines: z
      .array(
        z
          .object({
            inventoryItemId: z.guid(),
            openingQty: qty,
            unitPriceMajor: priceMajor,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type OpenStockDayInput = z.infer<typeof openStockDaySchema>;

/** Close the day: physical closing count (+ any mid-day received) per line. */
export const closeStockDaySchema = z
  .object({
    stockDayId: z.guid(),
    lines: z
      .array(
        z
          .object({
            lineId: z.guid(),
            closingQty: qty,
            receivedQty: qty,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type CloseStockDayInput = z.infer<typeof closeStockDaySchema>;

/** Periodic ingredient audit: a physical count of one ingredient vs the system. */
export const stockAuditSchema = z
  .object({
    inventoryItemId: z.guid(),
    countedQty: qty,
    note: z.string().trim().max(280).optional(),
  })
  .strict();

export type StockAuditInput = z.infer<typeof stockAuditSchema>;
