-- Migration 019 — merchandise sold-from-stock + scan-receive (restock)
--
-- The client resells bought-in packaged goods (soft drinks, snacks, bottled
-- water) as-is: received into stock by SCANNING on receipt, and sold at the
-- counter by SCANNING at billing. This folds the `merchandise` lane into the
-- SAME sold-from-stock machinery finished goods already use (migration 018b), so
-- there is still ONE ledger and one deduction path (CLAUDE.md §4):
--
--   * merchandise is now DECREMENTED ON SALE 1:1, exactly like a finished good —
--     a menu item points at the merchandise inventory_item via
--     menu_item.tracked_inventory_item_id, and the EXISTING deduct_order_sale
--     finished-good lane (which keys off tracked_inventory_item_id, kind-agnostic)
--     posts the `sale` movement. reverse_order_sale already mirrors it on
--     cancel/refund. Nothing in the sale/reversal path changes here.
--   * The daily physical count (migration 009) stays, but for merchandise it is
--     now a periodic AUDIT (a `count_adjust` reconciliation), NOT the revenue
--     source — revenue comes from billed orders, same as every other lane.
--   * Restock-on-receipt: receive_stock posts a `restock` movement (+qty) which
--     the apply trigger (migration 008) folds into qty_on_hand — the "goods
--     brought into the store" step, the inbound counterpart of a sale.
--
-- Two changes only:
--   1. Relax enforce_menu_item_tracked_good so a tracked item may be a
--      finished_good OR a merchandise item (both are OUTPUTS sold from stock). The
--      recipe-XOR-tracked-good mutual exclusion is unchanged. A merchandise item
--      is still NEVER routed through recipe_line (that stays ingredient-only, per
--      migration 012) — it is linked directly, like a finished good.
--   2. receive_stock(item, qty, note) — a SECURITY INVOKER RPC (RLS enforced) that
--      posts one `restock` movement for a tenant inventory item. Any tenant member
--      may run it; no revenue exposed. Rejects a non-positive qty and an
--      unknown/cross-tenant item. Restock is a purchase inbound, so it is allowed
--      for any stock-carrying kind (a finished good uses produce_batch instead, but
--      restock is not blocked — both are +qty inbounds through the one ledger).
--
-- No money here (quantity only) — a merchandise item's cash cost stays
-- unit_cost_cents; its retail price stays sale_price_cents / the linked menu
-- price. Stock may go negative; a sale is never blocked. Merchandise low-stock is
-- already surfaced by inventory_low_stock (migration 007, kind-agnostic) → the
-- Inventory nav badge + Low-Stock pill fire at threshold once sales decrement it.
-- Security (CLAUDE.md §7): no new tables; the RPC is SECURITY INVOKER with a
-- pinned search_path; business_id is re-derived from the session, never trusted.

-- ---------------------------------------------------------------------------
-- 1. A tracked (sold-from-stock) item may be a finished_good OR a merchandise
--    item. Both are OUTPUTS decremented 1:1 per sale; only ingredients (INPUTS)
--    are excluded. The recipe-XOR-tracked-good guard below is unchanged.
-- ---------------------------------------------------------------------------
create or replace function private.enforce_menu_item_tracked_good()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_kind text;
begin
  if new.tracked_inventory_item_id is null then
    return new;
  end if;

  -- The tracked item must be sold from stock (finished_good OR merchandise) and,
  -- via the composite FK, belong to the same tenant. Ingredients are INPUTS and
  -- are never tracked directly (they deduct via recipe_line).
  select kind into v_kind
  from public.inventory_item
  where id = new.tracked_inventory_item_id;

  if v_kind is distinct from 'finished_good' and v_kind is distinct from 'merchandise' then
    raise exception
      'menu_item.tracked_inventory_item_id must reference a finished_good or merchandise item (item % is kind=%)',
      new.tracked_inventory_item_id, coalesce(v_kind, 'unknown')
      using errcode = '23514';
  end if;

  -- A menu item cannot be both sold-from-stock and made-to-order (double count).
  if exists (
    select 1 from public.recipe_line rl
    where rl.menu_item_id = new.id
      and rl.business_id  = new.business_id
  ) then
    raise exception
      'menu_item % already has a recipe; a menu item is EITHER made-to-order OR sold-from-stock, never both',
      new.id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on column public.menu_item.tracked_inventory_item_id is
  'Nullable FK to a finished_good OR merchandise inventory_item. When set, this menu item is SOLD-FROM-STOCK: each realized sale decrements the tracked item 1:1 via a stock_movement sale. Mutually exclusive with a recipe (enforced).';

-- ---------------------------------------------------------------------------
-- 2. receive_stock — record goods brought into the store (+qty) as a `restock`
--    movement; the apply trigger (migration 008) folds it into qty_on_hand in the
--    same transaction. SECURITY INVOKER (RLS enforced), so any tenant member may
--    run it and a cross-tenant/unknown item is invisible ⇒ rejected. Rejects a
--    non-positive qty. Returns the updated row so the caller can show new stock.
-- ---------------------------------------------------------------------------
create or replace function public.receive_stock(
  p_inventory_item_id uuid,
  p_qty               numeric,
  p_note              text default null
)
returns public.inventory_item
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_item        public.inventory_item;
begin
  v_business_id := private.current_business_id();
  if v_business_id is null then
    raise exception 'receive_stock: no business for current user' using errcode = '42501';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'receive_stock: qty must be a positive number' using errcode = '22023';
  end if;

  -- Resolve under RLS: a cross-tenant / unknown item is invisible ⇒ not found.
  select * into v_item
  from public.inventory_item
  where id = p_inventory_item_id and business_id = v_business_id;

  if not found then
    raise exception 'receive_stock: no such inventory item' using errcode = 'PG002';
  end if;

  insert into public.stock_movement
    (business_id, inventory_item_id, delta, reason, note, created_by)
  values
    (v_business_id, p_inventory_item_id, p_qty, 'restock',
     nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid()));

  -- Re-read to return the running total after the apply trigger fired.
  select * into v_item
  from public.inventory_item
  where id = p_inventory_item_id and business_id = v_business_id;

  return v_item;
end;
$$;

revoke all on function public.receive_stock(uuid, numeric, text) from public;
grant execute on function public.receive_stock(uuid, numeric, text) to authenticated;

comment on function public.receive_stock(uuid, numeric, text) is
  'Receive goods into stock (+qty) via a `restock` stock_movement; the apply trigger folds it into qty_on_hand. The inbound counterpart of a sale — the scan-on-receipt step for bought-in resale goods. SECURITY INVOKER (RLS enforced); any tenant member may run it. Rejects non-positive qty and unknown items. authenticated-only.';
