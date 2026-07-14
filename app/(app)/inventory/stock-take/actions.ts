"use server";

// Stock-take server actions (daily merchandise count). openStockDay seeds today's
// session from merchandise inventory; closeStockDay records the evening counts and
// reconciles qty_on_hand. Both re-assert the session (requireProfile), Zod-validate
// the input (unknown fields rejected, §7.6), and call the SECURITY INVOKER RPCs so
// business_id is resolved server-side and the writes stay atomic + RLS-enforced
// (CLAUDE.md §7.3). Money (the selling-price snapshot) is converted to integer
// cents here — no float money is stored (§3). The RPCs are idempotent, so a
// double-submit can't open two days or double-post the closing adjustment.

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidateBusinessTags } from "@/lib/db/cache";
import { toCents } from "@/lib/money";
import { openStockDaySchema, closeStockDaySchema } from "@/lib/zod/stock";
import type { OpenStockDayInput, CloseStockDayInput } from "@/lib/zod/stock";

export type StockTakeState = { ok?: boolean; error?: string };

export async function openStockDay(input: OpenStockDayInput): Promise<StockTakeState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "stock.error.generic" };

  const parsed = openStockDaySchema.safeParse(input);
  if (!parsed.success) return { error: "stock.error.generic" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("open_stock_day", {
    p_date: parsed.data.date,
    p_lines: parsed.data.lines.map((l) => ({
      inventory_item_id: l.inventoryItemId,
      opening_qty: l.openingQty,
      unit_price_cents: toCents(l.unitPriceMajor),
    })),
  });
  if (error) return { error: "stock.error.generic" };

  // Opening seeds count lines but does not move qty_on_hand (only closing does),
  // so just the stock tag + the screen's route.
  revalidateBusinessTags(profile.business_id, ["stock"]);
  revalidatePath("/inventory/stock-take");
  return { ok: true };
}

export async function closeStockDay(input: CloseStockDayInput): Promise<StockTakeState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "stock.error.generic" };

  const parsed = closeStockDaySchema.safeParse(input);
  if (!parsed.success) return { error: "stock.error.generic" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_stock_day", {
    p_stock_day_id: parsed.data.stockDayId,
    p_lines: parsed.data.lines.map((l) => ({
      line_id: l.lineId,
      closing_qty: l.closingQty,
      received_qty: l.receivedQty,
    })),
  });
  if (error) return { error: "stock.error.generic" };

  // Closing writes qty_on_hand (count_adjust) ⇒ the low-stock badge + the
  // Dashboard summary + the End-of-Day report all change.
  revalidateBusinessTags(profile.business_id, ["stock", "inventory"]);
  revalidatePath("/inventory/stock-take");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { ok: true };
}
