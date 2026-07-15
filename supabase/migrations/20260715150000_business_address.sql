-- Migration — business.address (nullable), rendered on the printed bill/receipt.
--
-- A single free-text postal line the owner sets in Settings › Business Profile
-- and which the receipt prints at its foot (sourced from the row, never
-- hardcoded). Nullable: a tenant may leave it blank and the bill simply omits it.
--
-- Security: no new policy needed. The owner-only UPDATE policy on business
-- (migration 004) already gates writes, and business_freeze_identity pins only
-- id/created_at, so address is covered by the existing owner-writable surface.
-- Still tenant-scoped (a row is only reachable via id = current_business_id()).

alter table public.business
  add column if not exists address text;

comment on column public.business.address is
  'Optional postal address line shown at the foot of printed bills/receipts. Owner-editable in Settings.';
