// Zod schema for the new-order mutation. Validated server-side (CLAUDE.md §7.6);
// unknown fields rejected. Note what is NOT here: no subtotal, no total, no
// commission, no unit price. The client sends only WHICH menu items and HOW MANY
// — the server looks up the stored prices and recomputes every figure itself
// (CLAUDE.md §3/§7.7). business_id / customer_id are never client-set either.

import { z } from "zod";
import {
  ORDER_SOURCES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "@/lib/orders/order-config";

export const newOrderSchema = z.object({
  source: z.enum(ORDER_SOURCES as unknown as [string, ...string[]]),
  customerName: z.string().trim().max(120).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS as unknown as [string, ...string[]]),
  paymentStatus: z.enum(PAYMENT_STATUSES as unknown as [string, ...string[]]),
  // The order's lines: a menu item id + an integer quantity. At least one line.
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        qty: z.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(100),
});

export type NewOrderInput = z.infer<typeof newOrderSchema>;
