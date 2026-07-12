// Zod schema for the new-order mutation. Validated server-side (CLAUDE.md §7.6);
// unknown fields rejected. Note what is NOT here: no subtotal, no total, no
// commission, no unit price. The client sends only WHICH menu items and HOW MANY
// — the server looks up the stored prices and recomputes every figure itself
// (CLAUDE.md §3/§7.7). business_id / customer_id are never client-set either.

import { z } from "zod";
import { ORDER_SOURCES, PAYMENT_METHODS, PAYMENT_STATUSES } from "@/lib/orders/order-config";

export const newOrderSchema = z
  .object({
    source: z.enum(ORDER_SOURCES as unknown as [string, ...string[]]),
    customerName: z.string().trim().max(120).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS as unknown as [string, ...string[]]),
    paymentStatus: z.enum(PAYMENT_STATUSES as unknown as [string, ...string[]]),
    // The order's lines: a menu item id + an integer quantity. At least one line.
    items: z
      .array(
        z
          .object({
            // GUID (any 8-4-4-4-12 hex), NOT z.uuid(): the latter enforces an
            // RFC-9562 version/variant, which our seed/vanity ids (e.g.
            // eeeeeeee-0000-0000-0000-000000000004) do not carry — z.uuid() would
            // reject every seeded menu id and fail the whole order. Format is only
            // a shape guard anyway: create_order re-validates each id belongs to
            // this tenant's AVAILABLE menu server-side (CLAUDE.md §7.7).
            menuItemId: z.guid(),
            qty: z.number().int().min(1).max(999),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  // Reject unknown fields — the client sends only these (CLAUDE.md §7.6).
  .strict();

export type NewOrderInput = z.infer<typeof newOrderSchema>;
