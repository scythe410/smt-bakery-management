-- Migration 013 — non-negative CHECK constraints on money columns
--
-- CLI CRUD/deletion coverage (see LOG) found that a negative *_cents / rate_bps
-- value was accepted by the database on most money columns: the app-layer Zod
-- schemas were the ONLY guard. That violates the money non-negotiable
-- (CLAUDE.md §3 "Money"): money integrity must not depend on the client path.
-- Prior to this migration only employee.salary_cents and
-- inventory_item.sale_price_cents carried a CHECK.
--
-- This adds deny-by-default, defence-in-depth CHECK (>= 0) guards at the DB, so
-- no write path — server action, RPC, future integration, or manual SQL — can
-- store negative money. All money stays integer minor units (LKR); no behaviour
-- changes for valid data (the instance is blank and every seed/real figure is
-- >= 0). Nullable columns (booking deposit/balance) allow NULL as before.
--
-- NOT touched: inventory_item.qty_on_hand — stock MAY go negative by design
-- (CLAUDE.md §4: "system stock lies"; a sale is never blocked on stock). This is
-- a quantity, not money.

-- Catalog / price snapshots ------------------------------------------------
alter table public.menu_item
  add constraint menu_item_price_nonneg check (price_cents >= 0);

alter table public.inventory_item
  add constraint inventory_item_unit_cost_nonneg check (unit_cost_cents >= 0);

-- Finance ------------------------------------------------------------------
alter table public.expense
  add constraint expense_amount_nonneg check (amount_cents >= 0);

alter table public.commission_rule
  add constraint commission_rule_rate_nonneg check (rate_bps >= 0);

-- Bookings (deposit/balance are nullable) ----------------------------------
alter table public.booking
  add constraint booking_deposit_nonneg check (deposit_cents is null or deposit_cents >= 0),
  add constraint booking_balance_nonneg check (balance_cents is null or balance_cents >= 0);

-- Orders (server-computed, but guard the stored invariant) ------------------
alter table public."order"
  add constraint order_subtotal_nonneg   check (subtotal_cents   >= 0),
  add constraint order_commission_nonneg check (commission_cents >= 0),
  add constraint order_total_nonneg      check (total_cents      >= 0);

alter table public.order_item
  add constraint order_item_unit_price_nonneg check (unit_price_cents >= 0),
  add constraint order_item_qty_positive      check (qty >= 1);

-- Daily merchandise count snapshot -----------------------------------------
alter table public.stock_count_line
  add constraint stock_count_line_unit_price_nonneg check (unit_price_cents >= 0);
