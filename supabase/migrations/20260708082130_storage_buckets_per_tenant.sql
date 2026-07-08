-- Migration 003 — Storage buckets with per-tenant policies (CLAUDE.md §7.8)
--
-- Two private buckets:
--   * logos       — one business logo (business.logo_url points here).
--   * item-images — menu item / inventory photos (menu_item.image_url etc).
--
-- Security posture (CLAUDE.md §3, §7):
--   * Both buckets are PRIVATE (public = false). There is no anon policy on
--     storage.objects in this migration, so anon/unauthenticated access — read
--     OR write — is denied by default. No public write anywhere.
--   * Tenant isolation by PATH PREFIX: every object lives under
--     <business_id>/... . The FIRST path segment must equal the caller's own
--     business_id, resolved server-side via private.current_business_id()
--     (auth.uid() -> profile.business_id). A user can neither read nor write
--     another tenant's folder, exactly as with the domain tables.
--   * Private reads are served through SIGNED URLs generated server-side
--     (createSignedUrl); the stored *_url columns keep the object PATH, never an
--     ephemeral signed URL. See LOG.md "Storage path convention".
--
-- Object path convention (path = object name within the bucket):
--   logos        <business_id>/logo-<epoch>.<ext>
--   item-images  <business_id>/<menu_item_id>.<ext>   (or <uuid>.<ext>)
-- The first segment is always the business_id — that is what the policies gate on.
--
-- storage.objects already has RLS enabled by Supabase; we only add policies.
-- Note: (storage.foldername(name))[1] is the first folder of the object path.

-- ---------------------------------------------------------------------------
-- Buckets (private). Idempotent: db reset re-runs migrations from scratch, but
-- storage.buckets may persist across resets on a linked project, so upsert.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('logos',       'logos',       false, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('item-images', 'item-images', false, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Policies on storage.objects — one set covering both buckets, TO authenticated,
-- always gated on bucket + tenant path prefix.
--
-- Upsert needs INSERT + SELECT + UPDATE (Supabase storage semantics); we provide
-- all four verbs so read, upload, replace and delete are tenant-scoped.
-- drop-if-exists keeps the migration re-appliable during local iteration.
-- ---------------------------------------------------------------------------
drop policy if exists "tenant objects: read"   on storage.objects;
drop policy if exists "tenant objects: insert" on storage.objects;
drop policy if exists "tenant objects: update" on storage.objects;
drop policy if exists "tenant objects: delete" on storage.objects;

create policy "tenant objects: read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id in ('logos', 'item-images')
    and (storage.foldername(name))[1] = private.current_business_id()::text
  );

create policy "tenant objects: insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id in ('logos', 'item-images')
    and (storage.foldername(name))[1] = private.current_business_id()::text
  );

create policy "tenant objects: update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id in ('logos', 'item-images')
    and (storage.foldername(name))[1] = private.current_business_id()::text
  )
  with check (
    bucket_id in ('logos', 'item-images')
    and (storage.foldername(name))[1] = private.current_business_id()::text
  );

create policy "tenant objects: delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id in ('logos', 'item-images')
    and (storage.foldername(name))[1] = private.current_business_id()::text
  );
