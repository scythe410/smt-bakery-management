-- Migration 024 — one menu item per tracked stock row (AUDIT 1.5)
--
-- Nothing stopped two menu items from tracking the same inventory_item:
-- concurrent first-scans of a new barcode at billing (resolveScannedBarcode's
-- check-then-insert window), or picking an already-tracked item in the menu
-- form's sold-from-stock select. Stock stayed correct (each sale still posts one
-- movement against the same row), but the menu accumulated duplicates and the
-- scan action's limit(1) lookup then picked one nondeterministically.
--
-- A partial unique index closes both doors at the DB. No business_id column in
-- the key: inventory ids are globally unique uuids, and the existing composite
-- FK (tracked_inventory_item_id, business_id) already pins the tenant.
--
-- The scan action treats a collision as "lost the race": it re-selects the row
-- that won and bills that same record. The menu form surfaces it as a distinct,
-- user-fixable error (menu.form.errorTrackedDuplicate).
--
-- Verified duplicate-free on the linked project before adding (2026-07-23);
-- a fresh clone is trivially clean, so no dedupe step is needed here.

create unique index menu_item_tracked_inventory_item_key
  on public.menu_item (tracked_inventory_item_id)
  where tracked_inventory_item_id is not null;

comment on index public.menu_item_tracked_inventory_item_key is
  'At most one menu item may track (sell from) a given inventory_item — a duplicate link would list the same stock row twice on the menu. Partial: untracked (made-to-order) items are unconstrained.';
