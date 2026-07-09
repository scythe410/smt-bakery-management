// Zod schema for the add-inventory-item mutation. Validated server-side
// (CLAUDE.md §7.6); business_id is NEVER taken from the client — the action sets
// it from the authenticated profile. Unit cost arrives in major units (rupees)
// and is converted to integer cents in the action (lib/money.toCents) — no float
// money is ever stored (CLAUDE.md §3). `category`/`kind` are constrained to the
// Postgres enum values so the client can't smuggle an out-of-enum value in.

import { z } from "zod";
import { INVENTORY_CATEGORIES, INVENTORY_KINDS } from "@/lib/inventory-config";

export const addInventoryItemSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(INVENTORY_KINDS as unknown as [string, ...string[]]),
    category: z.enum(INVENTORY_CATEGORIES as unknown as [string, ...string[]]),
    // Quantity + threshold are non-negative decimals (numeric(12,3) in the DB).
    qtyOnHand: z.coerce.number().min(0).finite().max(1_000_000_000),
    unit: z.string().trim().min(1).max(20),
    // Major-unit unit cost (rupees) → cents in the action.
    unitCostMajor: z.coerce.number().min(0).finite().max(1_000_000_000),
    lowStockThreshold: z.coerce.number().min(0).finite().max(1_000_000_000),
    // Optional scanned/typed barcode. Stored verbatim (an empty value is coerced to
    // undefined by the action → NULL, so the partial unique index isn't hit for
    // barcode-less items). Kept generous (≤64) so a QR-encoded SKU also fits.
    barcode: z.string().trim().min(1).max(64).optional(),
  })
  // Reject unknown fields (CLAUDE.md §7.6).
  .strict();

export type AddInventoryItemInput = z.infer<typeof addInventoryItemSchema>;

/**
 * A barcode we will look up against the product API: a GTIN — EAN-13/8, UPC-A/E —
 * so 8–14 digits only. Manual entry and 1D scans both flow through this before we
 * spend a network call; a non-numeric code (e.g. a QR payload) simply skips the
 * lookup and falls back to a blank form.
 */
export const barcodeLookupSchema = z
  .string()
  .trim()
  .regex(/^\d{8,14}$/);
