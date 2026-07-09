# Samantha's Bakery

Mobile-first café/bakery operations web app — a client-facing demo instance of **BizCore**
(NeuralShift). Built on real Supabase + real auth + real Row-Level Security so it can graduate to
production without a rewrite. Reference viewport ~390px.

Read `CLAUDE.md` (scope & conventions) and `DESIGN.md` (visual system) before contributing; `LOG.md`
is the running change log.

## Stack

- **Next.js 16 (App Router) + TypeScript + Tailwind v4** — mobile-first.
- **Supabase** — Postgres + Auth (email/password via `@supabase/ssr` cookie sessions) + Storage.
- **Recharts** (charts), **lucide-react** (icons), **i18next** (en + si), **@zxing/browser** (barcode).
- **Fonts**: Archivo (display), Inter (body), Noto Sans Sinhala (applied when `lang="si"`).

## Prerequisites

- **Node.js 20+** and npm.
- **Supabase CLI** (`brew install supabase/tap/supabase` or see the Supabase docs).
- **Docker** — only if you want a fully local Supabase (`supabase start`). Not needed if you point at
  a hosted project.

## 1. Install & configure

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` (all four are required; the app fails fast at boot if any are missing):

| Variable | Scope | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Anon key. The **only** Supabase key that ships to the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | Never `NEXT_PUBLIC_`. Guarded by `lib/env.ts` (throws if read in the browser). |
| `NEXT_PUBLIC_SITE_URL` | public | Base URL for auth redirects (`http://localhost:3000` in dev). |

`.env*` is gitignored (except `.env.example`); never commit real values.

## 2. Set up the database

**Option A — hosted project (what this demo uses):**

```bash
supabase link --project-ref <your-ref>     # prompts for the DB password
supabase db push                           # apply migrations in supabase/migrations/
supabase db query --linked -f supabase/seed.sql   # load demo data (optional)
```

**Option B — fully local:**

```bash
supabase start                             # boots local Postgres/Auth/Storage (Docker)
supabase db reset                          # applies migrations + seed.sql
```

Regenerate typed DB types after a schema change:

```bash
supabase gen types typescript --linked > lib/supabase/types.ts
```

### Demo logins (from `seed.sql`, dev-only)

| Role | Email | Password |
| --- | --- | --- |
| owner | `owner@samanthas.demo` | `Owner#12345` |
| manager | `manager@samanthas.demo` | `Manager#12345` |
| staff | `staff@samanthas.demo` | `Staff#12345` |

The seed dates orders/expenses relative to when it ran; re-seed to refresh "today" for a lively demo.

## 3. Run

```bash
npm run dev      # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | ESLint (flat config, `eslint-config-next`) |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check (CI) |

## Security

Security is the priority (`CLAUDE.md §7`). What's in place, and how to verify it:

- **RLS on every table, deny-by-default.** Tenant isolation resolves `auth.uid()` → `profile.business_id`;
  a user can never read another business's rows. `role` / `business_id` / `id` are set server-side
  (signup trigger + identity-freeze triggers), never client-settable.
- **Negative RLS tests** (transaction-scoped, roll back cleanly — safe against any environment,
  including the seeded demo DB):

  ```bash
  supabase db query --linked -f supabase/tests/rls_tenant_isolation.sql   # cross-tenant read/write blocked
  supabase db query --linked -f supabase/tests/rls_domain_access.sql      # per-role access matrix
  ```

  Every returned row should read `pass = true`.
- **service_role never reaches the client** — it's read only through `getServiceRoleKey()` in a
  server context (and isn't used in app code at all); only the anon key + URL are `NEXT_PUBLIC_*`.
- **Money & identity are never trusted from the client.** Order totals and commission are recomputed
  server-side from stored prices + `commission_rule`; all money is integer minor units (`*_cents`).
  Every mutation is validated with **Zod** (`.strict()` — unknown fields rejected).
- **Storage** (`logos`, `item-images`) buckets are **private**; policies are tenant-path-scoped to
  `authenticated` only (no public read/write); private reads use signed URLs.
- **Security headers** are set for every response. Static headers (HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) live in `next.config.ts`. The
  **Content-Security-Policy** is emitted per request in `middleware.ts` with a fresh **nonce** —
  production uses `script-src 'self' 'nonce-…' 'strict-dynamic'` (no `unsafe-inline` scripts). Verify
  on a production build:

  ```bash
  npm run build && npm start
  curl -sI http://localhost:3000/login | grep -i content-security-policy
  ```

  (`style-src` keeps `'unsafe-inline'` — Next/Tailwind/Recharts emit inline style attributes a nonce
  cannot cover; this is the one documented allowance.)

## Design tokens

Color / radius / shadow tokens are CSS variables in `app/globals.css` (`:root`), sourced from
`DESIGN.md §2`; `tailwind.config.ts` maps them to semantic utilities (`bg-surface`, `text-muted`,
`text-brand`, …). Status colors are tuned to meet WCAG AA. Re-theming touches only those files.
