// Zod schema for the new-order mutation. Validated server-side (CLAUDE.md §7.6);
// unknown fields rejected. Note what is NOT here: no subtotal, no total, no
// commission, no unit price. The client sends only WHICH menu items and HOW MANY
// — the server looks up the stored prices and recomputes every figure itself
// (CLAUDE.md §3/§7.7). business_id / customer_id are never client-set either.

import { z } from "zod";
import {
  DISCOUNT_PCTS,
  ORDER_SOURCES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "@/lib/orders/order-config";

export const newOrderSchema = z
  .object({
    source: z.enum(ORDER_SOURCES as unknown as [string, ...string[]]),
    customerName: z.string().trim().max(120).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS as unknown as [string, ...string[]]),
    paymentStatus: z.enum(PAYMENT_STATUSES as unknown as [string, ...string[]]),
    // Whole-order discount: one of the fixed quick-buttons (default 0 = none).
    // Coerced because it arrives as a FormData string. The server RECOMPUTES the
    // discount_cents + net total from stored prices — this only picks the rate.
    discountPct: z.coerce
      .number()
      .refine((n) => (DISCOUNT_PCTS as readonly number[]).includes(n), {
        message: "invalid discount",
      })
      .default(0),
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

// Edit-order mutation: the same client contract as newOrderSchema (which menu
// items, how many, no money) plus which order. Pending-only is enforced by the
// update_order RPC (errcode OR002), not here. orderId is z.guid() for the
// seed/vanity ids, as elsewhere.
export const updateOrderSchema = newOrderSchema.extend({
  orderId: z.guid(),
});

export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

// Zod schema for the Orders list READ query (the fetchOrders action). It's a
// read, but the input still crosses the client→server boundary, so it's validated
// and unknown fields are rejected — the tab/filters/page become DB predicates
// server-side, never raw SQL. Every filter is optional; `nullable` because the
// client sends `null` for a cleared filter.
export const orderListQuerySchema = z
  .object({
    tab: z.enum(["active", "archived"]),
    source: z.enum(ORDER_SOURCES as unknown as [string, ...string[]]).nullish(),
    status: z.enum(ORDER_STATUSES as unknown as [string, ...string[]]).nullish(),
    payment: z.enum(PAYMENT_METHODS as unknown as [string, ...string[]]).nullish(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish(),
    search: z.string().trim().max(100).nullish(),
    page: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

// Zod schema for the status-transition mutation (the changeOrderStatus action).
// The client sends only which order and which target status; the RPC
// (public.set_order_status) re-resolves the order under RLS, validates the
// transition, and keeps the stock ledger consistent server-side. business_id /
// id are never client-set. orderId is z.guid() (shape guard only) to accept the
// seed/vanity ids, exactly like newOrderSchema's line ids.
export const orderStatusChangeSchema = z
  .object({
    orderId: z.guid(),
    status: z.enum(ORDER_STATUSES as unknown as [string, ...string[]]),
  })
  .strict();

export type OrderStatusChangeInput = z.infer<typeof orderStatusChangeSchema>;

// A scanned/typed barcode resolved at billing (the resolveScannedBarcode action).
// Shape guard only; the server looks the code up against this tenant's stock under
// RLS and, if needed, links it to a sold-from-stock menu item (CLAUDE.md §4).
export const scanBarcodeSchema = z.string().trim().min(1).max(64);
