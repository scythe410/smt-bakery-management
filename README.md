# Samantha's Bakery

Mobile-first café/bakery operations web app — a client-facing demo instance of **BizCore**
(NeuralShift). Built to graduate to production: real Supabase + real auth + real RLS.

Reference viewport ~390px. See `CLAUDE.md` (scope & conventions) and `DESIGN.md` (visual system)
before contributing. `LOG.md` is the running change log.

## Stack

- **Next.js (App Router) + TypeScript + Tailwind v4** — mobile-first.
- **Supabase** (Postgres + Auth + Storage) — _not wired up yet_ (a later step).
- **Fonts**: Archivo (display), Inter (body), Noto Sans Sinhala (loaded, applied with `si`).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in when Supabase is added
npm run dev                  # http://localhost:3000
```

## Scripts

| Script                 | What it does                          |
| ---------------------- | ------------------------------------- |
| `npm run dev`          | Start the dev server                  |
| `npm run build`        | Production build                      |
| `npm start`            | Run the production build              |
| `npm run lint`         | ESLint (flat config, `eslint-config-next`) |
| `npm run format`       | Prettier write                        |
| `npm run format:check` | Prettier check (CI)                   |

## Design tokens

Color / radius / shadow tokens live as CSS variables in `app/globals.css` (`:root`), sourced from
`DESIGN.md §2`. `tailwind.config.ts` maps them to semantic utilities (`bg-surface`, `text-muted`,
`text-brand`, `ring-brand`, …). Re-theming touches only those two files.

## Security

Strict security headers (CSP, HSTS, `X-Frame-Options: DENY`, etc.) are set in `next.config.ts`.
The CSP currently allows `'unsafe-inline'` scripts as a temporary measure — to be replaced with a
per-request nonce once middleware is introduced alongside Supabase. See the comment in
`next.config.ts` and `CLAUDE.md §7`.
