-- Migration 006 — drop image/svg+xml from the logos bucket (hardening)
--
-- Migration 003 created the logos bucket allowing
-- ['image/png','image/jpeg','image/webp','image/svg+xml']. SVG is an XML format
-- that can embed <script> / event handlers, so an uploaded SVG logo served back
-- to a browser is a stored-XSS vector. Logos never need to be vector, so we
-- remove SVG and keep only raster formats. The app-side allow-list
-- (LOGO_MIME_EXT in lib/zod/settings.ts) is trimmed to match.
--
-- Additive + idempotent: we do NOT edit migration 003 (already applied). This
-- rewrites only the logos bucket's allowed_mime_types; item-images already
-- excluded SVG and is untouched.

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'logos';
