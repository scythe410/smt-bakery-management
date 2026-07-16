-- Migration 018a — FT3 enum values for the finished-good lane
--
-- A THIRD inventory lane (CLAUDE.md §4): `finished_good` — items the bakery
-- PRODUCES in batches, holds in stock, and decrements per sale (hot dogs,
-- pastries). Adds the two enum values the rest of FT3 needs:
--   * inventory_item.kind        += 'finished_good'
--   * stock_movement.reason      += 'production'  (the morning "make N" step)
--
-- WHY ITS OWN MIGRATION: Postgres cannot USE a new enum value in the SAME
-- transaction that adds it ("unsafe use of new value"). Each migration file runs
-- in its own transaction, so adding the values here — and using them in the next
-- migration (schema, triggers, view) — is the documented, safe split. IF NOT
-- EXISTS keeps a re-run idempotent.

alter type public.inventory_kind add value if not exists 'finished_good';

alter type public.stock_movement_reason add value if not exists 'production';
