-- Migration — public.set_order_status: change an order's status, ledger-safe.
--
-- The Orders screen needs to move an order among pending / completed / cancelled
-- (and reopen a cancelled one). The catch (CLAUDE.md §4 "Inventory
-- reconciliation"): a naive status flip would corrupt inventory. This RPC keeps
-- the FT1 stock_movement ledger consistent WITHOUT re-implementing deduction —
-- the existing `order_sync_stock` AFTER UPDATE trigger (migration 008) already
-- posts the compensating movements in the SAME transaction as the status change,
-- and its helpers are idempotent per (ref_order_id, inventory_item_id, reason).
-- So all this function has to do is perform a guarded, validated UPDATE.
--
-- What "ledger-safe" means here, spelled out against FT1's deduct-once /
-- reverse-once idempotency key:
--   * → completed (into the realized/"sold" state): the trigger deducts recipe
--     ingredients ONLY IF not already deducted (ON CONFLICT DO NOTHING on the
--     `sale` row). A first completion deducts once; a re-run is a no-op.
--   * → cancelled / → pending (out of "sold"): the trigger REVERSES prior
--     deductions ONLY IF a `sale` exists and it hasn't already been reversed
--     (idempotent `sale_reversal`). Cancelling a never-completed order touches no
--     stock.
--   * THE TRAP the idempotency key creates: once an order has been reversed, its
--     `sale` row still exists, so re-entering "sold" would NOT re-deduct (the
--     insert conflicts) yet WOULD count as revenue again — stock lies, books lie.
--     We forbid that transition outright (errcode OR001) rather than silently
--     corrupt inventory. A refunded/voided order cannot be "completed" again; it
--     must be recreated. This is the deliberate consequence of reusing the key.
--
-- A cancelled order is never realized revenue: REALIZED_STATUS = 'completed'
-- (lib/db/selectors/_shared.ts), so Dashboard / Finance / Reports / bill all drop
-- it the moment status leaves 'completed' — and the stock it consumed comes back
-- via the reversal in the same transaction. Everything reconciles.
--
-- Security (CLAUDE.md §7): SECURITY INVOKER, pinned search_path. RLS scopes the
-- UPDATE to the caller's tenant ("order: tenant access"), so a cross-tenant order
-- is invisible and cannot be touched. status is the ONLY column written; id /
-- business_id / money are never changed here. authenticated-only; any tenant role
-- that can create an order (owner / manager / staff) can also transition one.

create or replace function public.set_order_status(
  p_order_id   uuid,
  p_new_status public.order_status
)
returns public."order"
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old_status public.order_status;
  v_order      public."order";
begin
  -- Resolve the current status under RLS. A row from another tenant is invisible
  -- ⇒ not found ⇒ we refuse (never leak existence across tenants).
  select status into v_old_status
  from public."order"
  where id = p_order_id;

  if not found then
    raise exception 'set_order_status: order % not found', p_order_id
      using errcode = 'OR404';
  end if;

  -- No-op: same status. Return the row unchanged so a double-tap / retry is inert
  -- (no UPDATE, no updated_at bump, no trigger fire).
  if v_old_status = p_new_status then
    select * into v_order from public."order" where id = p_order_id;
    return v_order;
  end if;

  -- Ledger-safety guard (see header): cannot re-realize a reversed order, because
  -- the idempotency key would suppress the re-deduction while revenue re-counts.
  if p_new_status = 'completed'
     and exists (
       select 1 from public.stock_movement
       where ref_order_id = p_order_id
         and reason = 'sale_reversal'
     ) then
    raise exception
      'set_order_status: order % was reversed and cannot be completed again', p_order_id
      using errcode = 'OR001';
  end if;

  -- The write. The order_sync_stock AFTER UPDATE trigger posts the deduct/reverse
  -- movement atomically here; its helpers are idempotent, so this is exactly-once.
  update public."order"
     set status = p_new_status
   where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all     on function public.set_order_status(uuid, public.order_status) from public;
grant  execute on function public.set_order_status(uuid, public.order_status) to authenticated;

comment on function public.set_order_status(uuid, public.order_status) is
  'Transition an order''s status (pending/completed/cancelled) for the caller''s tenant. SECURITY INVOKER (RLS enforced). Only status is written. The order_sync_stock trigger keeps the stock_movement ledger consistent atomically (deduct-once into realized, reverse-once out of it); re-completing a reversed order is refused (errcode OR001). authenticated-only.';
