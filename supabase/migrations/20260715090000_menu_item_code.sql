-- Migration 010 — menu_item.item_code: per-tenant sequential POS code (SPEC CF3)
--
-- Adds item_code (integer, NOT NULL) to menu_item for fast POS lookup (CF3).
-- Auto-assigned by a BEFORE INSERT trigger: reads MAX(item_code)+1 within the
-- caller's business. The column is also editable (Zod-validated in the action);
-- the unique constraint rejects a collision and the action surfaces a clear error.
--
-- Security (CLAUDE.md §7.3): the trigger function is SECURITY DEFINER with a
-- pinned search_path so it can query public.menu_item safely without caller
-- privilege escalation. business_id is already set on `new` by the
-- menu_item_set_business_id trigger (fires first alphabetically).
-- ---------------------------------------------------------------------------

alter table public.menu_item
  add column item_code integer not null default 0;

-- Unique per business — two items in the same bakery can't share a code.
create unique index menu_item_code_unique_per_business
  on public.menu_item (business_id, item_code);

-- ---------------------------------------------------------------------------
-- Auto-assign trigger function
-- ---------------------------------------------------------------------------
create or replace function private.set_menu_item_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 0 (the column default) signals "please assign"; anything else is explicit.
  if new.item_code is null or new.item_code = 0 then
    select coalesce(max(m.item_code), 0) + 1
      into new.item_code
      from public.menu_item m
     where m.business_id = new.business_id;
  end if;
  return new;
end;
$$;

revoke all on function private.set_menu_item_code() from public;

-- Fires BEFORE INSERT — after set_business_id_from_session (alphabetical order:
-- "set_business_id" < "set_item_code"), so new.business_id is already resolved.
create trigger menu_item_set_item_code
  before insert on public.menu_item
  for each row
  execute function private.set_menu_item_code();

-- ---------------------------------------------------------------------------
-- Backfill existing rows with sequential codes per business
-- ---------------------------------------------------------------------------
with numbered as (
  select id,
         row_number() over (partition by business_id order by created_at, id) as rn
    from public.menu_item
   where item_code = 0
)
update public.menu_item m
   set item_code = n.rn
  from numbered n
 where m.id = n.id;
