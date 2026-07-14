-- Migration 009 — daily merchandise stock-take + periodic ingredient audit
--
-- Implements the merchandise lane of CLAUDE.md §4 "Inventory reconciliation":
-- `ingredient` stock is recipe-deducted on sale (migration 008); `merchandise`
-- stock is reconciled by a DAILY PHYSICAL COUNT. This migration adds that count
-- and the ingredient lane's periodic spot-audit. Both write through the ONE
-- append-only stock_movement ledger (migration 008) as `count_adjust`, so
-- inventory_item.qty_on_hand stays the single running total.
--
--   * stock_day        — one open→closed session per (business_id, date). Opening
--                        the day seeds a count line per MERCHANDISE item.
--   * stock_count_line — per-item opening / received / closing counts + a selling
--                        price SNAPSHOTTED at open. Derived (never stored):
--                          units_out    = opening_qty + received_qty - closing_qty
--                          revenue_cents = units_out * unit_price_cents
--                          left          = closing_qty
--   * Closing the day writes each physical closing_qty back to qty_on_hand via a
--     `count_adjust` movement (delta = closing - system running total), so the
--     merchandise lane's consumption lands in the ledger exactly like the
--     ingredient lane's — one source of truth for the running total.
--   * The periodic ingredient audit is a `count_adjust` movement too (counted −
--     system), posted directly by its server action (a single ledger insert, like
--     a restock) — kept separate from the daily merchandise count.
--
-- Money stays integer cents (unit_price_cents). Physical `units_out * price` is the
-- merchandise revenue basis the client asked for; it is the SELLING price snapshot,
-- distinct from inventory_item.unit_cost_cents (cash cost). Quantities are
-- numeric(12,3) on the item's stocking unit — same basis as the ledger, no
-- conversion (CLAUDE.md §4 "No unit conversion").
--
-- Security (CLAUDE.md §7): both tables are RLS tenant-scoped; business_id is
-- stamped from the session on insert (never client-settable) and frozen on update.
-- The open/close RPCs are SECURITY INVOKER (RLS stays in force) and idempotent, so
-- a re-run can't create a second day or double-post the closing adjustment. All
-- roles may run counts (inventory is all-roles, §5); the REVENUE figures are gated
-- in the selectors/UI (owner/manager), and the End-of-Day report lives in Reports
-- (owner/manager only).

-- ---------------------------------------------------------------------------
-- 1. Session status enum + the two tables.
-- ---------------------------------------------------------------------------
create type public.stock_day_status as enum ('open', 'closed');

create table public.stock_day (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business (id) on delete cascade,
  date        date not null,
  status      public.stock_day_status not null default 'open',
  opened_by   uuid references public.profile (id) on delete set null,
  opened_at   timestamptz not null default now(),
  closed_by   uuid references public.profile (id) on delete set null,
  closed_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, business_id),
  -- One count session per day per tenant ⇒ "Open day" is idempotent per date.
  unique (business_id, date)
);

comment on table public.stock_day is
  'One daily merchandise stock-take session per (business_id, date). open→closed; closing reconciles qty_on_hand via count_adjust movements. Unique per date so Open day is idempotent.';

create table public.stock_count_line (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.business (id) on delete cascade,
  stock_day_id      uuid not null,
  inventory_item_id uuid not null,
  opening_qty       numeric(12, 3) not null default 0,
  received_qty      numeric(12, 3) not null default 0,
  -- Null until the day is closed; the physical evening count.
  closing_qty       numeric(12, 3),
  -- SELLING price per unit, snapshotted at open (frozen like an order line), so a
  -- later menu-price change never rewrites a past day's revenue.
  unit_price_cents  integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, business_id),
  -- One line per item per day.
  unique (stock_day_id, inventory_item_id),
  -- Composite FKs: a line can never point at another tenant's day/item.
  foreign key (stock_day_id, business_id)
    references public.stock_day (id, business_id) on delete cascade,
  foreign key (inventory_item_id, business_id)
    references public.inventory_item (id, business_id) on delete cascade
);

comment on table public.stock_count_line is
  'Per-item daily count: opening/received/closing (base unit) + unit_price_cents snapshot. Derived: units_out = opening + received - closing; revenue_cents = units_out * unit_price_cents.';

create index stock_day_business_date_idx    on public.stock_day (business_id, date desc);
create index stock_count_line_day_idx        on public.stock_count_line (stock_day_id, business_id);
create index stock_count_line_item_idx       on public.stock_count_line (inventory_item_id, business_id);

-- Now that stock_day exists, tie the ledger's reserved ref_stock_day_id to it
-- (composite so a movement can never reference another tenant's day). Migration
-- 008 left this column FK-less because the table did not exist yet.
alter table public.stock_movement
  add constraint stock_movement_ref_stock_day_fk
  foreign key (ref_stock_day_id, business_id)
  references public.stock_day (id, business_id) on delete set null (ref_stock_day_id);

-- ---------------------------------------------------------------------------
-- 2. Triggers — stamp business_id on insert; touch updated_at + freeze on update
--    (reused generic functions from migration 002).
-- ---------------------------------------------------------------------------
create trigger stock_day_set_business_id
  before insert on public.stock_day
  for each row execute function private.set_business_id_from_session();
create trigger stock_day_touch
  before update on public.stock_day
  for each row execute function private.touch_and_freeze();

create trigger stock_count_line_set_business_id
  before insert on public.stock_count_line
  for each row execute function private.set_business_id_from_session();
create trigger stock_count_line_touch
  before update on public.stock_count_line
  for each row execute function private.touch_and_freeze();

-- ---------------------------------------------------------------------------
-- 3. RLS — tenant access for all roles (inventory is all-roles, §5). Revenue
--    visibility is enforced above the DB (selectors/UI + Reports role gate).
-- ---------------------------------------------------------------------------
alter table public.stock_day        enable row level security;
alter table public.stock_count_line enable row level security;

create policy "stock_day: tenant access" on public.stock_day
  for all to authenticated
  using ( business_id = private.current_business_id() )
  with check ( business_id = private.current_business_id() );

create policy "stock_count_line: tenant access" on public.stock_count_line
  for all to authenticated
  using ( business_id = private.current_business_id() )
  with check ( business_id = private.current_business_id() );

-- ---------------------------------------------------------------------------
-- 4. open_stock_day — idempotent per date. Creates today's session and seeds a
--    count line per MERCHANDISE item. The join to inventory_item filters p_lines
--    to this tenant's merchandise, so a non-merchandise or cross-tenant id is
--    silently dropped (ingredients never enter the daily lane). opening_qty
--    defaults to the item's current qty_on_hand (editable by the caller);
--    unit_price_cents is the caller's snapshot (0 when no selling price is known).
-- ---------------------------------------------------------------------------
create or replace function public.open_stock_day(p_date date, p_lines jsonb)
returns public.stock_day
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_day         public.stock_day;
begin
  v_business_id := private.current_business_id();
  if v_business_id is null then
    raise exception 'open_stock_day: no business for current user' using errcode = '42501';
  end if;

  -- Idempotent: a day already exists for this date ⇒ return it untouched (never
  -- reseed / clobber counts already entered).
  select * into v_day
  from public.stock_day
  where business_id = v_business_id and date = p_date;
  if found then
    return v_day;
  end if;

  insert into public.stock_day (business_id, date, status, opened_by, opened_at)
  values (v_business_id, p_date, 'open', (select auth.uid()), now())
  returning * into v_day;

  insert into public.stock_count_line
    (business_id, stock_day_id, inventory_item_id, opening_qty, received_qty, unit_price_cents)
  select
    v_business_id,
    v_day.id,
    inv.id,
    coalesce(nullif(l->>'opening_qty', '')::numeric, inv.qty_on_hand),
    coalesce(nullif(l->>'received_qty', '')::numeric, 0),
    coalesce(nullif(l->>'unit_price_cents', '')::int, 0)
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
  join public.inventory_item inv
    on inv.id = (l->>'inventory_item_id')::uuid
   and inv.business_id = v_business_id
   and inv.kind = 'merchandise';

  return v_day;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. close_stock_day — apply the evening closing counts, reconcile qty_on_hand
--    via count_adjust movements (delta = physical closing − system running
--    total; zero-delta lines post nothing), then close the session. Idempotent:
--    a non-open day returns unchanged, so a re-submit can't double-post the
--    adjustment (count_adjust is NOT covered by the sale idempotency index — the
--    status guard is its guard).
-- ---------------------------------------------------------------------------
create or replace function public.close_stock_day(p_stock_day_id uuid, p_lines jsonb)
returns public.stock_day
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_day         public.stock_day;
begin
  v_business_id := private.current_business_id();
  if v_business_id is null then
    raise exception 'close_stock_day: no business for current user' using errcode = '42501';
  end if;

  select * into v_day
  from public.stock_day
  where id = p_stock_day_id and business_id = v_business_id;
  if not found then
    raise exception 'close_stock_day: no such stock day' using errcode = '42501';
  end if;
  -- Already closed (or otherwise not open) ⇒ no-op, idempotent.
  if v_day.status <> 'open' then
    return v_day;
  end if;

  update public.stock_count_line scl
  set closing_qty  = nullif(l->>'closing_qty', '')::numeric,
      received_qty = coalesce(nullif(l->>'received_qty', '')::numeric, scl.received_qty)
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
  where scl.id = (l->>'line_id')::uuid
    and scl.stock_day_id = v_day.id
    and scl.business_id  = v_business_id;

  -- Reconcile the ledger to the physical closing count.
  insert into public.stock_movement
    (business_id, inventory_item_id, delta, reason, ref_stock_day_id, note, created_by)
  select
    scl.business_id,
    scl.inventory_item_id,
    scl.closing_qty - inv.qty_on_hand,      -- physical − system running total
    'count_adjust',
    v_day.id,
    'daily merchandise count',
    (select auth.uid())
  from public.stock_count_line scl
  join public.inventory_item inv
    on inv.id = scl.inventory_item_id
   and inv.business_id = scl.business_id
  where scl.stock_day_id = v_day.id
    and scl.closing_qty is not null
    and scl.closing_qty - inv.qty_on_hand <> 0;

  update public.stock_day
  set status = 'closed', closed_by = (select auth.uid()), closed_at = now()
  where id = v_day.id
  returning * into v_day;

  return v_day;
end;
$$;

revoke all on function public.open_stock_day(date, jsonb)         from public;
revoke all on function public.close_stock_day(uuid, jsonb)        from public;
grant execute on function public.open_stock_day(date, jsonb)      to authenticated;
grant execute on function public.close_stock_day(uuid, jsonb)     to authenticated;

comment on function public.open_stock_day(date, jsonb) is
  'Idempotently open a daily merchandise stock-take for the caller''s tenant and seed a count line per merchandise item. SECURITY INVOKER (RLS enforced). authenticated-only.';
comment on function public.close_stock_day(uuid, jsonb) is
  'Apply closing counts, reconcile qty_on_hand via count_adjust movements, and close the day. Idempotent (non-open day is a no-op). SECURITY INVOKER (RLS enforced). authenticated-only.';

-- ---------------------------------------------------------------------------
-- 6. merchandise_sale_price — the selling price to SNAPSHOT when opening a day:
--    the max linked menu price for a merchandise item sold 1:1 through orders
--    (via recipe_line → menu_item). Pure-retail goods with no menu link don't
--    appear ⇒ the open-day form defaults their price to 0 for the user to set.
--    security_invoker: the querier's RLS applies; service-role callers still
--    filter business_id (same posture as recipe_cost_line, migration 007).
-- ---------------------------------------------------------------------------
create or replace view public.merchandise_sale_price
  with (security_invoker = on) as
  select
    inv.business_id,
    inv.id as inventory_item_id,
    max(m.price_cents) as price_cents
  from public.inventory_item inv
  join public.recipe_line rl
    on rl.inventory_item_id = inv.id and rl.business_id = inv.business_id
  join public.menu_item m
    on m.id = rl.menu_item_id and m.business_id = inv.business_id
  where inv.kind = 'merchandise'
  group by inv.business_id, inv.id;

comment on view public.merchandise_sale_price is
  'Suggested per-unit SELLING price for a merchandise item = max linked menu price (recipe_line → menu_item). Prefills the Open-day snapshot; missing ⇒ 0 (user sets it). security_invoker.';

grant select on public.merchandise_sale_price to anon, authenticated, service_role;
