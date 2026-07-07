-- Migration 002 — domain schema (CLAUDE.md §4) with per-role RLS (§5 matrix, §7)
--
-- Tables: customer, inventory_item, menu_item, recipe_line, "order", order_item,
--         expense, booking, employee, commission_rule, notification.
--
-- Conventions carried from migration 001:
--   * All money is *_cents integer. No floats touch money.
--   * Every table carries business_id (tenant scope), created_at, updated_at.
--   * business_id / id are NEVER client-settable:
--       - BEFORE INSERT  private.set_business_id_from_session() stamps business_id
--         from the caller's session (overriding any client value); service-role /
--         seed contexts (auth.uid() is null) keep the explicit value.
--       - BEFORE UPDATE  private.touch_and_freeze() bumps updated_at and freezes
--         id + business_id back to their stored values.
--   * Child rows use composite FKs (parent_id, business_id) -> parent(id, business_id)
--     so a row can never reference another tenant's parent.
--
-- Access matrix (§5), enforced by RLS TO authenticated:
--   * all roles (owner/manager/staff): customer, inventory_item, menu_item,
--     recipe_line, "order", order_item, booking, notification.
--   * owner/manager ONLY (staff denied even SELECT): expense, commission_rule, employee.
-- "order" is a reserved word — it must be double-quoted in raw SQL.

-- ---------------------------------------------------------------------------
-- Enums (§5)
-- ---------------------------------------------------------------------------
create type public.order_source as enum
  ('dine_in', 'walk_in', 'whatsapp', 'online', 'pickme_food', 'uber_eats');
create type public.payment_method as enum ('cash', 'card', 'online', 'wallet');
create type public.payment_status as enum ('unpaid', 'paid', 'refunded');
create type public.order_status as enum ('pending', 'completed', 'cancelled');
create type public.booking_type as enum ('reservation', 'custom_order');
create type public.booking_status as enum ('pending', 'confirmed', 'completed', 'cancelled');
create type public.inventory_kind as enum ('ingredient', 'merchandise');
create type public.inventory_category as enum
  ('baking', 'beverages', 'syrups_toppings', 'merch', 'other');

-- ---------------------------------------------------------------------------
-- Helpers & generic trigger functions (private schema — never Data-API exposed)
-- ---------------------------------------------------------------------------

-- Caller's role, self-scoped by auth.uid(). Used by finance/employee policies.
-- (Named *app_role* to avoid clashing with the reserved CURRENT_ROLE.)
create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profile p where p.id = (select auth.uid());
$$;

revoke all on function private.current_app_role() from public;
grant execute on function private.current_app_role() to authenticated;

-- BEFORE INSERT: stamp business_id from the session. For an authenticated user
-- this OVERRIDES any client-supplied value (client can never choose a tenant).
-- For service-role / seed (auth.uid() null) the explicit value is preserved.
create or replace function private.set_business_id_from_session()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.business_id := private.current_business_id();
  end if;
  return new;
end;
$$;

-- BEFORE UPDATE: bump updated_at and freeze the tenant identity of the row.
create or replace function private.touch_and_freeze()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at  := now();
  new.id          := old.id;
  new.business_id := old.business_id;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- customer -----------------------------------------------------------------
create table public.customer (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business (id) on delete cascade,
  name        text not null,
  phone       text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, business_id)
);

-- inventory_item -----------------------------------------------------------
create table public.inventory_item (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.business (id) on delete cascade,
  name                text not null,
  kind                public.inventory_kind not null,
  category            public.inventory_category not null default 'other',
  qty_on_hand         numeric(12, 3) not null default 0,
  unit                text not null default 'unit',
  unit_cost_cents     integer not null default 0,
  low_stock_threshold numeric(12, 3) not null default 0,
  barcode             text,
  sku                 text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, business_id)
);

-- menu_item ----------------------------------------------------------------
create table public.menu_item (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.business (id) on delete cascade,
  name         text not null,
  price_cents  integer not null default 0,
  category     text,
  image_url    text,
  is_available boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, business_id)
);

-- recipe_line (BOM) --------------------------------------------------------
create table public.recipe_line (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.business (id) on delete cascade,
  menu_item_id      uuid not null,
  inventory_item_id uuid not null,
  qty               numeric(12, 3) not null,
  unit              text not null default 'unit',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (menu_item_id, business_id)
    references public.menu_item (id, business_id) on delete cascade,
  foreign key (inventory_item_id, business_id)
    references public.inventory_item (id, business_id) on delete cascade,
  unique (menu_item_id, inventory_item_id)
);

-- order (reserved word — quoted) -------------------------------------------
create table public."order" (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.business (id) on delete cascade,
  order_no       text not null,
  source         public.order_source not null default 'walk_in',
  customer_id    uuid,
  customer_name  text,
  subtotal_cents   integer not null default 0,
  commission_cents integer not null default 0,
  total_cents      integer not null default 0,
  payment_method public.payment_method,
  payment_status public.payment_status not null default 'unpaid',
  status         public.order_status not null default 'pending',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, order_no),
  foreign key (customer_id, business_id)
    references public.customer (id, business_id) on delete set null (customer_id)
);

-- order_item (snapshots name + unit price at time of sale) -----------------
create table public.order_item (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.business (id) on delete cascade,
  order_id         uuid not null,
  menu_item_id     uuid,
  name_snapshot    text not null,
  qty              integer not null default 1,
  unit_price_cents integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (order_id, business_id)
    references public."order" (id, business_id) on delete cascade,
  foreign key (menu_item_id, business_id)
    references public.menu_item (id, business_id) on delete set null (menu_item_id)
);

-- expense (FINANCE — owner/manager only) -----------------------------------
create table public.expense (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.business (id) on delete cascade,
  date         date not null default current_date,
  category     text not null,
  amount_cents integer not null,
  note         text,
  created_by   uuid references public.profile (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- booking (reservation | custom_order) -------------------------------------
create table public.booking (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.business (id) on delete cascade,
  type             public.booking_type not null,
  date             date,
  time             time,
  status           public.booking_status not null default 'pending',
  source           public.order_source,
  customer_id      uuid,
  customer_name    text,
  customer_phone   text,
  -- reservation
  party_size       integer,
  -- custom_order
  item_description text,
  deposit_cents    integer,
  balance_cents    integer,
  pickup_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (customer_id, business_id)
    references public.customer (id, business_id) on delete set null (customer_id)
);

-- employee (owner/manager only) --------------------------------------------
create table public.employee (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.business (id) on delete cascade,
  name           text not null,
  role           text,
  permissions    jsonb not null default '{}'::jsonb,
  shift_schedule jsonb not null default '{}'::jsonb,
  profile_id     uuid references public.profile (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- commission_rule (FINANCE — owner/manager only) ---------------------------
create table public.commission_rule (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business (id) on delete cascade,
  source      public.order_source not null,
  rate_bps    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (business_id, source)
);

-- notification (bell badge) ------------------------------------------------
create table public.notification (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business (id) on delete cascade,
  type        text not null,
  message     text not null,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes (business_id everywhere; plus lookup/sort/foreign-key indexes)
-- ---------------------------------------------------------------------------
create index customer_business_id_idx        on public.customer (business_id);
create index customer_business_phone_idx     on public.customer (business_id, phone);

create index inventory_item_business_id_idx  on public.inventory_item (business_id);
create index inventory_item_category_idx     on public.inventory_item (business_id, category);
-- barcode unique per business (nulls allowed & non-unique via partial index)
create unique index inventory_item_barcode_key
  on public.inventory_item (business_id, barcode) where barcode is not null;

create index menu_item_business_id_idx       on public.menu_item (business_id);
create index menu_item_available_idx         on public.menu_item (business_id, is_available);

create index recipe_line_business_id_idx     on public.recipe_line (business_id);
create index recipe_line_menu_item_idx       on public.recipe_line (menu_item_id, business_id);
create index recipe_line_inventory_item_idx  on public.recipe_line (inventory_item_id, business_id);

create index order_business_id_idx           on public."order" (business_id);
create index order_created_at_idx            on public."order" (business_id, created_at desc);
create index order_status_idx                on public."order" (business_id, status);
create index order_customer_idx              on public."order" (customer_id, business_id);

create index order_item_business_id_idx      on public.order_item (business_id);
create index order_item_order_idx            on public.order_item (order_id, business_id);
create index order_item_menu_item_idx        on public.order_item (menu_item_id, business_id);

create index expense_business_id_idx         on public.expense (business_id);
create index expense_date_idx               on public.expense (business_id, date desc);
create index expense_created_by_idx          on public.expense (created_by);

create index booking_business_id_idx         on public.booking (business_id);
create index booking_date_idx                on public.booking (business_id, date);
create index booking_status_idx              on public.booking (business_id, status);
create index booking_customer_idx            on public.booking (customer_id, business_id);

create index employee_business_id_idx        on public.employee (business_id);
create index employee_profile_idx            on public.employee (profile_id);

create index commission_rule_business_id_idx on public.commission_rule (business_id);

create index notification_business_id_idx    on public.notification (business_id);
create index notification_unread_idx         on public.notification (business_id, is_read);

-- ---------------------------------------------------------------------------
-- Triggers: stamp business_id on insert; touch updated_at + freeze on update
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'customer','inventory_item','menu_item','recipe_line','order','order_item',
    'expense','booking','employee','commission_rule','notification'
  ] loop
    execute format(
      'create trigger %I before insert on public.%I
         for each row execute function private.set_business_id_from_session()',
      t || '_set_business_id', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function private.touch_and_freeze()',
      t || '_touch', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security — enable + deny-by-default on EVERY table
-- ---------------------------------------------------------------------------
alter table public.customer         enable row level security;
alter table public.inventory_item   enable row level security;
alter table public.menu_item        enable row level security;
alter table public.recipe_line      enable row level security;
alter table public."order"          enable row level security;
alter table public.order_item       enable row level security;
alter table public.expense          enable row level security;
alter table public.booking          enable row level security;
alter table public.employee         enable row level security;
alter table public.commission_rule  enable row level security;
alter table public.notification     enable row level security;

-- All-roles tables: any authenticated member of the tenant. A single FOR ALL
-- policy governs SELECT (using), INSERT (with check), UPDATE (both), DELETE
-- (using) — deny-by-default still applies to everyone outside the tenant.
create policy "customer: tenant access" on public.customer
  for all to authenticated
  using ( business_id = private.current_business_id() )
  with check ( business_id = private.current_business_id() );

create policy "inventory_item: tenant access" on public.inventory_item
  for all to authenticated
  using ( business_id = private.current_business_id() )
  with check ( business_id = private.current_business_id() );

create policy "menu_item: tenant access" on public.menu_item
  for all to authenticated
  using ( business_id = private.current_business_id() )
  with check ( business_id = private.current_business_id() );

create policy "recipe_line: tenant access" on public.recipe_line
  for all to authenticated
  using ( business_id = private.current_business_id() )
  with check ( business_id = private.current_business_id() );

create policy "order: tenant access" on public."order"
  for all to authenticated
  using ( business_id = private.current_business_id() )
  with check ( business_id = private.current_business_id() );

create policy "order_item: tenant access" on public.order_item
  for all to authenticated
  using ( business_id = private.current_business_id() )
  with check ( business_id = private.current_business_id() );

create policy "booking: tenant access" on public.booking
  for all to authenticated
  using ( business_id = private.current_business_id() )
  with check ( business_id = private.current_business_id() );

create policy "notification: tenant access" on public.notification
  for all to authenticated
  using ( business_id = private.current_business_id() )
  with check ( business_id = private.current_business_id() );

-- Finance-sensitive + employee tables: owner/manager only. staff has NO policy
-- path here, so staff cannot even SELECT these rows.
create policy "expense: owner/manager access" on public.expense
  for all to authenticated
  using (
    business_id = private.current_business_id()
    and private.current_app_role() in ('owner', 'manager')
  )
  with check (
    business_id = private.current_business_id()
    and private.current_app_role() in ('owner', 'manager')
  );

create policy "commission_rule: owner/manager access" on public.commission_rule
  for all to authenticated
  using (
    business_id = private.current_business_id()
    and private.current_app_role() in ('owner', 'manager')
  )
  with check (
    business_id = private.current_business_id()
    and private.current_app_role() in ('owner', 'manager')
  );

create policy "employee: owner/manager access" on public.employee
  for all to authenticated
  using (
    business_id = private.current_business_id()
    and private.current_app_role() in ('owner', 'manager')
  )
  with check (
    business_id = private.current_business_id()
    and private.current_app_role() in ('owner', 'manager')
  );
