-- Migration 023b — return_finished_good: pull end-of-day leftovers from stock
--
-- The end-of-day counterpart of produce_batch (migration 018b). A daily finished
-- good that didn't sell is RETURNED (removed) so the next day opens fresh from the
-- new batch. One `return` stock_movement of -qty against the finished good; the
-- apply trigger (migration 008) folds it into qty_on_hand in the same transaction.
--
-- Honest accounting (CLAUDE.md §4, §8): this is stock/waste tracking, NOT a sale —
-- it reduces quantity only and posts NO expense/revenue line. Money is untouched
-- (a finished good's cash cost stays unit_cost_cents). Mirrors produce_batch:
-- SECURITY INVOKER (RLS enforced), so any tenant member (owner/manager/kitchen)
-- may run it; a cross-tenant/unknown item is invisible ⇒ rejected; only
-- finished_good items are returnable; qty must be positive. Returns the updated
-- row so the caller can show the new (fresh) stock.
create or replace function public.return_finished_good(
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
  v_kind        text;
  v_item        public.inventory_item;
begin
  v_business_id := private.current_business_id();
  if v_business_id is null then
    raise exception 'return_finished_good: no business for current user' using errcode = '42501';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'return_finished_good: qty must be a positive number' using errcode = '22023';
  end if;

  -- Resolve under RLS: a cross-tenant / unknown item is invisible ⇒ not found.
  select kind into v_kind
  from public.inventory_item
  where id = p_inventory_item_id and business_id = v_business_id;

  if not found then
    raise exception 'return_finished_good: no such inventory item' using errcode = 'PG002';
  end if;
  if v_kind is distinct from 'finished_good' then
    raise exception 'return_finished_good: item % is kind=%; only finished_good items are returned',
      p_inventory_item_id, coalesce(v_kind, 'unknown')
      using errcode = '22023';
  end if;

  insert into public.stock_movement
    (business_id, inventory_item_id, delta, reason, note, created_by)
  values
    (v_business_id, p_inventory_item_id, -p_qty, 'return',
     nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid()));

  -- Re-read to return the running total after the apply trigger fired.
  select * into v_item
  from public.inventory_item
  where id = p_inventory_item_id and business_id = v_business_id;

  return v_item;
end;
$$;

revoke all on function public.return_finished_good(uuid, numeric, text) from public;
grant execute on function public.return_finished_good(uuid, numeric, text) to authenticated;

comment on function public.return_finished_good(uuid, numeric, text) is
  'Return (remove) end-of-day leftover finished goods via a `return` stock_movement (-qty); the apply trigger folds it into qty_on_hand. Daily-renewal waste/leftover tracking, NOT a sale (no revenue/expense posted; quantity only). SECURITY INVOKER (RLS enforced); any tenant member may run it. Rejects non-finished-good items and non-positive qty. authenticated-only.';
