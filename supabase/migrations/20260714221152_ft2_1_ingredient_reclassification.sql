-- Migration 012 — FT2.1: packaging reclassification + explicit merchandise sale price
--
-- Three packaging items (Paper Cups, Cake Boxes, Napkins) are consumed per sale
-- via recipe_lines and belong in the ingredient lane (recipe-deducted quantity
-- tracking). Only true retail goods — Branded Tote Bag, Ceramic Coffee Mug —
-- remain merchandise (physical daily count lane).
--
-- A new sale_price_cents column on inventory_item holds the explicit retail price
-- for merchandise items. The merchandise_sale_price view is rewritten to source
-- this column instead of the heuristic "max linked menu price" derivation.
--
-- A DB-level trigger on recipe_line now enforces that only ingredient-kind items
-- may appear in a recipe (defence in depth — the server action already checks).
--
-- Security: no new tables or RLS changes. Existing inventory_item policies
-- (tenant-scoped, owner/manager/staff CRUD) cover the new column automatically.

-- 1. Explicit retail price column on inventory_item (NULL for ingredients).
alter table public.inventory_item
  add column sale_price_cents integer check (sale_price_cents >= 0);

comment on column public.inventory_item.sale_price_cents is
  'Retail selling price for merchandise items (LKR minor units). Set explicitly; never derived. NULL for ingredients. Snapshotted into stock_count_line.unit_price_cents when a stock day is opened.';

-- 2. Rewrite merchandise_sale_price view to use the explicit column.
--    Coalesces to 0 when unset so the open-day form shows 0 for the user to fill in.
create or replace view public.merchandise_sale_price
  with (security_invoker = on) as
  select
    business_id,
    id            as inventory_item_id,
    coalesce(sale_price_cents, 0) as price_cents
  from public.inventory_item
  where kind = 'merchandise';

comment on view public.merchandise_sale_price is
  'Retail selling price for merchandise items, sourced from inventory_item.sale_price_cents. Returns 0 when unset (user fills it on the open-day form). security_invoker.';

grant select on public.merchandise_sale_price to anon, authenticated, service_role;

-- 3. DB-level guard: recipe_line may only reference ingredient-kind items.
create or replace function private.enforce_recipe_line_ingredient_kind()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_kind text;
begin
  select kind into v_kind
    from public.inventory_item
   where id = new.inventory_item_id;

  if v_kind is distinct from 'ingredient' then
    raise exception
      'recipe_line: item % is kind=%; only ingredient-kind items may appear in a recipe',
      new.inventory_item_id, coalesce(v_kind, 'unknown');
  end if;
  return new;
end;
$$;

create trigger recipe_line_enforce_ingredient_kind
  before insert or update on public.recipe_line
  for each row execute function private.enforce_recipe_line_ingredient_kind();
