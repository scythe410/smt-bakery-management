-- Migration 018b — FT3: finished-good stock tracking + production alerts
--
-- Implements the third inventory lane (CLAUDE.md §4). A `finished_good` is an
-- OUTPUT the bakery produces in batches and sells from stock, decremented per
-- sale through the ONE append-only stock_movement ledger (migration 008) — no
-- parallel ledger. This migration adds:
--
--   1. menu_item.tracked_inventory_item_id — nullable FK → a finished_good item.
--      When set, that menu item is SOLD-FROM-STOCK (decrement the good 1:1 per
--      sale) rather than MADE-TO-ORDER (recipe_line ingredients). A menu item has
--      EITHER a recipe OR a tracked good, never both (double-count guard), and the
--      tracked item must be kind = 'finished_good'. Both invariants are enforced by
--      triggers on menu_item AND recipe_line (defence in depth — the server action
--      checks too).
--   2. deduct_order_sale extended: a realized sale of a stock-tracked menu item
--      posts a `sale` movement of -(order qty) against its tracked good, aggregated
--      per item and idempotent via FT1's key. Because finished-good sales are plain
--      `sale` movements with a ref_order_id, the EXISTING reverse_order_sale
--      (mirrors every `sale` for the order, negated) already reverses them on
--      cancel/refund — nothing new needed there. This rides on MF2's status
--      transitions (order_sync_stock trigger).
--   3. produce_batch(item, qty, note) — the morning "make N" step: a `production`
--      movement of +qty against a finished_good, which the apply trigger folds into
--      qty_on_hand. SECURITY INVOKER (RLS enforced), so any tenant member
--      (owner/manager/staff) may run it; no revenue exposed.
--   4. production_alert view — finished_good items at/below low_stock_threshold
--      ("make another batch"). Reuses the low-stock rule (migration 007), scoped to
--      kind = 'finished_good'. Powers the Production Alerts list and the bell badge;
--      derived from current stock, so it is inherently DEDUPED (one row per item).
--
-- No money here (quantity only) — a finished good's cash cost stays unit_cost_cents;
-- decrement is qty-only, exactly like the ingredient lane. Stock may go negative;
-- a sale is never blocked. Security (CLAUDE.md §7): no new tables; the new column
-- rides the existing tenant-scoped inventory_item / menu_item policies; the composite
-- FK makes a cross-tenant link impossible; all functions are SECURITY INVOKER with a
-- pinned search_path.

-- ---------------------------------------------------------------------------
-- 1. menu_item.tracked_inventory_item_id — the sold-from-stock link.
--    Composite FK (id, business_id) so a menu item can only ever point at its OWN
--    tenant's inventory row. ON DELETE SET NULL nulls only this column (business_id
--    stays), mirroring order.customer_id: deleting the finished good unlinks the
--    menu item (it silently reverts to no stock tracking) rather than cascading.
-- ---------------------------------------------------------------------------
alter table public.menu_item
  add column tracked_inventory_item_id uuid,
  add constraint menu_item_tracked_good_fk
    foreign key (tracked_inventory_item_id, business_id)
    references public.inventory_item (id, business_id)
    on delete set null (tracked_inventory_item_id);

comment on column public.menu_item.tracked_inventory_item_id is
  'Nullable FK to a finished_good inventory_item. When set, this menu item is SOLD-FROM-STOCK: each realized sale decrements the finished good 1:1 via a stock_movement sale. Mutually exclusive with a recipe (enforced).';

create index menu_item_tracked_good_idx
  on public.menu_item (tracked_inventory_item_id)
  where tracked_inventory_item_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Mutual-exclusion + kind guards. Enforced from BOTH sides so neither order of
--    operations can create the illegal both-lanes state:
--      * menu_item side: setting a tracked good requires kind = 'finished_good'
--        AND no existing recipe_line for the item.
--      * recipe_line side: adding a line requires the menu item has NO tracked good.
--    SECURITY INVOKER: every table read is the caller's own tenant (RLS in force).
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

  -- The tracked item must be a finished good (and, via the composite FK, same tenant).
  select kind into v_kind
  from public.inventory_item
  where id = new.tracked_inventory_item_id;

  if v_kind is distinct from 'finished_good' then
    raise exception
      'menu_item.tracked_inventory_item_id must reference a finished_good (item % is kind=%)',
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

create trigger menu_item_enforce_tracked_good
  before insert or update on public.menu_item
  for each row execute function private.enforce_menu_item_tracked_good();

create or replace function private.enforce_recipe_line_no_tracked_good()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.menu_item m
    where m.id = new.menu_item_id
      and m.business_id = new.business_id
      and m.tracked_inventory_item_id is not null
  ) then
    raise exception
      'menu_item % is sold-from-stock (tracked finished good); it cannot also have a recipe',
      new.menu_item_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger recipe_line_enforce_no_tracked_good
  before insert or update on public.recipe_line
  for each row execute function private.enforce_recipe_line_no_tracked_good();

-- ---------------------------------------------------------------------------
-- 3. deduct_order_sale — now covers BOTH sale lanes in one idempotent insert.
--    Ingredient lane: order_item → recipe_line (unchanged). Finished-good lane:
--    order_item → menu_item.tracked_inventory_item_id, 1:1 per unit. UNION ALL the
--    per-line deltas, then aggregate per inventory_item_id so an item can never
--    produce two `sale` rows for one order (matches the unique idempotency index).
--    A menu item is EITHER recipe OR tracked (enforced above), so the two lanes
--    never touch the same item — but summing per item is correct regardless.
--    reverse_order_sale is UNCHANGED: it mirrors every `sale` for the order, so it
--    already reverses finished-good sales on cancel/refund.
-- ---------------------------------------------------------------------------
create or replace function private.deduct_order_sale(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.stock_movement
    (business_id, inventory_item_id, delta, reason, ref_order_id, created_by)
  select
    lanes.business_id,
    lanes.inventory_item_id,
    -sum(lanes.qty_out),            -- negative: stock leaves on a sale
    'sale',
    lanes.order_id,
    (select auth.uid())
  from (
    -- Ingredient lane: recipe BOM × order qty.
    select oi.business_id, oi.order_id, rl.inventory_item_id,
           rl.qty * oi.qty as qty_out
    from public.order_item oi
    join public.recipe_line rl
      on rl.menu_item_id = oi.menu_item_id
     and rl.business_id  = oi.business_id
    where oi.order_id = p_order_id

    union all

    -- Finished-good lane: the tracked OUTPUT, 1:1 per unit sold.
    select oi.business_id, oi.order_id, m.tracked_inventory_item_id,
           oi.qty::numeric as qty_out
    from public.order_item oi
    join public.menu_item m
      on m.id = oi.menu_item_id
     and m.business_id = oi.business_id
    where oi.order_id = p_order_id
      and m.tracked_inventory_item_id is not null
  ) lanes
  group by lanes.business_id, lanes.order_id, lanes.inventory_item_id
  on conflict (ref_order_id, inventory_item_id, reason)
    where ref_order_id is not null and reason in ('sale', 'sale_reversal')
  do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. produce_batch — add a produced batch (+qty) to a finished good. This is the
--    morning "make 20" step. One `production` ledger insert; the apply trigger
--    (migration 008) bumps qty_on_hand in the same transaction. SECURITY INVOKER,
--    so RLS scopes the tenant and any member (owner/manager/staff) may run it.
--    Rejects a non-finished-good target and a non-positive qty.
-- ---------------------------------------------------------------------------
create or replace function public.produce_batch(
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
    raise exception 'produce_batch: no business for current user' using errcode = '42501';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'produce_batch: qty must be a positive number' using errcode = '22023';
  end if;

  -- Resolve under RLS: a cross-tenant / unknown item is invisible ⇒ not found.
  select kind into v_kind
  from public.inventory_item
  where id = p_inventory_item_id and business_id = v_business_id;

  if not found then
    raise exception 'produce_batch: no such inventory item' using errcode = 'PG002';
  end if;
  if v_kind is distinct from 'finished_good' then
    raise exception 'produce_batch: item % is kind=%; only finished_good items are produced in batches',
      p_inventory_item_id, coalesce(v_kind, 'unknown')
      using errcode = '22023';
  end if;

  insert into public.stock_movement
    (business_id, inventory_item_id, delta, reason, note, created_by)
  values
    (v_business_id, p_inventory_item_id, p_qty, 'production',
     nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid()));

  select * into v_item
  from public.inventory_item
  where id = p_inventory_item_id and business_id = v_business_id;

  return v_item;
end;
$$;

revoke all on function public.produce_batch(uuid, numeric, text) from public;
grant execute on function public.produce_batch(uuid, numeric, text) to authenticated;

comment on function public.produce_batch(uuid, numeric, text) is
  'Produce a batch (+qty) of a finished_good via a `production` stock_movement; the apply trigger folds it into qty_on_hand. SECURITY INVOKER (RLS enforced); any tenant member may run it. Rejects non-finished-good items and non-positive qty. authenticated-only.';

-- ---------------------------------------------------------------------------
-- 5. production_alert — finished goods at/below their reorder threshold. Same
--    rule as inventory_low_stock (migration 007) but scoped to finished_good and
--    carrying the fields the alert row/bell need. security_invoker: the querier's
--    RLS applies; service-role callers still filter business_id.
-- ---------------------------------------------------------------------------
create or replace view public.production_alert
  with (security_invoker = on) as
  select
    id,
    business_id,
    name,
    qty_on_hand,
    low_stock_threshold,
    unit
  from public.inventory_item
  where kind = 'finished_good'
    and qty_on_hand <= low_stock_threshold;

comment on view public.production_alert is
  'Finished-good items at/below low_stock_threshold — the "make another batch" list and the bell alert count. Derived from current stock (inherently deduped, one row per item). security_invoker: the querier''s RLS applies; service-role callers still filter business_id.';

grant select on public.production_alert to anon, authenticated, service_role;
