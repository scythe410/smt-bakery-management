-- Migration 001 — core tenancy + auth
--
-- Establishes the multi-tenant foundation: businesses (tenants) and profiles
-- (1:1 with auth.users). Everything downstream scopes by business_id.
--
-- Security posture (CLAUDE.md §3, §7):
--   * RLS enabled on every table, deny-by-default (no policy => no access).
--   * Tenant isolation resolved server-side: auth.uid() -> profile.business_id.
--   * business_id / role / id are NEVER client-settable. A profile row is created
--     only by the on-signup trigger (SECURITY DEFINER), and a BEFORE UPDATE guard
--     freezes id/business_id/role so a client can never escalate or hop tenants.
--   * All privileged/helper functions live in a PRIVATE schema that PostgREST
--     does not expose, so none of them are reachable as /rest/v1/rpc endpoints.

-- ---------------------------------------------------------------------------
-- Private schema — home for privileged helpers & trigger functions.
-- Not added to the PostgREST exposed schemas, so nothing here is callable via
-- the Data API. anon gets no USAGE at all; authenticated gets USAGE only so RLS
-- policies can call the two accessor helpers (granted individually below).
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Enums (public — referenced by table columns and generated app types)
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('owner', 'manager', 'staff');
create type public.app_language as enum ('en', 'si');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- business = the tenant. No business_id on itself (it IS the tenant boundary).
create table public.business (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  logo_url        text,
  currency        text not null default 'LKR',
  timezone        text not null default 'Asia/Colombo',
  locale_default  public.app_language not null default 'en',
  tax_config      jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.business is 'Tenant root. All other business data is scoped to a business_id referencing this table.';

-- profile = 1:1 with auth.users. id equals the auth uid.
create table public.profile (
  id            uuid primary key references auth.users (id) on delete cascade,
  business_id   uuid references public.business (id) on delete cascade,
  name          text not null,
  role          public.app_role not null default 'staff',
  language_pref public.app_language not null default 'en',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profile is '1:1 with auth.users (id = auth uid). business_id/role are server-set only; a client can never write them (see private.profile_freeze_privileged_columns trigger + RLS).';

create index profile_business_id_idx on public.profile (business_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance (trigger-only; SECURITY INVOKER — no table access)
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger business_set_updated_at
  before update on public.business
  for each row execute function private.set_updated_at();

create trigger profile_set_updated_at
  before update on public.profile
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth accessor helpers
--
-- SECURITY DEFINER + pinned empty search_path so they can read public.profile
-- from inside RLS policies WITHOUT re-triggering RLS on profile (which would
-- recurse). Each is self-scoping: it only ever returns the CALLER's own row
-- (filtered by auth.uid()), so definer rights cannot leak another tenant's data.
-- They live in the private schema (unreachable via the Data API) and EXECUTE is
-- granted only to authenticated (needed because RLS evaluates them as that role).
-- ---------------------------------------------------------------------------
create or replace function private.current_profile()
returns public.profile
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
  from public.profile p
  where p.id = (select auth.uid());
$$;

create or replace function private.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.business_id
  from public.profile p
  where p.id = (select auth.uid());
$$;

revoke all on function private.current_profile() from public;
revoke all on function private.current_business_id() from public;
grant execute on function private.current_profile() to authenticated;
grant execute on function private.current_business_id() to authenticated;

-- ---------------------------------------------------------------------------
-- On signup: create the matching profile row (server-side only)
--
-- Authorization fields come from raw_app_meta_data (app_metadata), which is
-- settable ONLY via the service_role / Admin API — never by the client. We do
-- NOT read business_id or role from raw_user_meta_data (user-editable => unsafe
-- for authorization; see Supabase security guidance). Display-only fields (name,
-- language preference) may come from user_metadata.
--
-- business_id may be null at raw signup (before a user is provisioned to a
-- tenant). That is intentional and fails CLOSED: current_business_id() returns
-- null, so no RLS predicate matches and the user sees nothing until an admin
-- assigns their business via app_metadata.
--
-- Trigger-only: no role holds EXECUTE, so it is not callable as an RPC. The
-- trigger fires it regardless (trigger execution does not check EXECUTE).
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profile (id, business_id, name, role, language_pref)
  values (
    new.id,
    nullif(new.raw_app_meta_data ->> 'business_id', '')::uuid,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), new.email, 'User'),
    coalesce(nullif(new.raw_app_meta_data ->> 'role', ''), 'staff')::public.app_role,
    coalesce(nullif(new.raw_user_meta_data ->> 'language', ''), 'en')::public.app_language
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Freeze privileged columns on profile updates. Even with a permissive UPDATE
-- policy, a client can only ever change name/language_pref: id, business_id and
-- role are forced back to their stored values here (CLAUDE.md §7.3).
create or replace function private.profile_freeze_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.id          := old.id;
  new.business_id := old.business_id;
  new.role        := old.role;
  return new;
end;
$$;

create trigger profile_freeze_privileged_columns
  before update on public.profile
  for each row execute function private.profile_freeze_privileged_columns();

-- ---------------------------------------------------------------------------
-- Row Level Security — deny by default, then explicit least-privilege policies
-- ---------------------------------------------------------------------------
alter table public.business enable row level security;
alter table public.profile enable row level security;

-- No INSERT/UPDATE/DELETE policies on business or profile for app clients in
-- this migration => those operations are denied by default. Profile rows are
-- created by the signup trigger; business rows are provisioned by admin/seed.

-- business: a user may read only their own tenant.
create policy "business: read own tenant"
  on public.business
  for select
  to authenticated
  using ( id = private.current_business_id() );

-- profile: a user may read only their own profile row.
create policy "profile: read own"
  on public.profile
  for select
  to authenticated
  using ( id = (select auth.uid()) );

-- profile: a user may update only their own profile row. Privileged columns are
-- additionally frozen by the trigger above, so this only permits editing
-- name/language_pref. WITH CHECK re-asserts ownership on the resulting row.
create policy "profile: update own"
  on public.profile
  for update
  to authenticated
  using ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );
