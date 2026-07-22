-- Migration 025 — business contact phone for the printed bill
--
-- Client request: the bill footer must carry the shop's phone number(s). Free
-- text like address (may hold several numbers, e.g. "077 425 0255 / 074 231
-- 0255"); no format imposed. Edited on the Settings business profile
-- (owner-only via the existing business UPDATE policy); rendered under the
-- address on the bill footer when set.

alter table public.business
  add column phone text;

comment on column public.business.phone is
  'Contact phone line(s) printed on the bill footer, as entered (free text, may hold several numbers). NULL omits the line.';
