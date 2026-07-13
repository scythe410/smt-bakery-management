# LOG

Running change log for Samantha's Bakery (BizCore demo). Newest entry on top.
Each entry: what changed, decisions made, deviations, open questions. One prompt = one entry.

---

## 2026-07-14 — PF7: bound list queries + push filtering into the database

Four unbounded/inefficient reads flagged by Antigravity. Each pulled rows only to reduce/filter them
in app code; all four now let Postgres do the work and return only what's needed. **No figure changes**
— the period-scoped cached selectors (PF2) are untouched; these were the *screen list* reads and two
*derived* reads, all made to reconcile identically.

### What changed
- **Orders — bounded + DB-filtered (HIGH-1).** `listAllOrdersWithItems()` (every order + items, no
  limit; tabs/filters run client-side) is replaced by `listOrdersPage(filters, page)`: the
  Active/Archived tab (→ status set), plus source/status/payment/date/search, are **SQL predicates**;
  the window is `.range()`d (fetch `PAGE_SIZE+1` to detect a further page). The local `date` filter is
  resolved to a half-open UTC instant range in the tenant timezone so it matches the row's `dateKey`
  day. New `fetchOrders` **server action** (auth re-asserted, Zod-validated, RLS-scoped) serves filter
  changes + "Load more"; the server component seeds page 0 + tab counts. `OrdersBrowser` is now
  server-driven (one page at a time, monotonic-request-id guard against out-of-order responses).
- **Bookings — bounded + DB-filtered (MED-2).** Symmetric: `listAllBookings()` → `listBookingsPage`
  with type/status/date/search predicates + `.range()`; `fetchBookings` action; `getBookingTypeCounts`
  for the segment badges; `BookingsBrowser` server-driven with "Load more". (`booking.date` is a plain
  local date, so the date filter is a verbatim `.eq` — no tz conversion.)
- **Low-stock badge (MED-4).** `qty_on_hand <= low_stock_threshold` is a column-vs-column comparison
  PostgREST can't express, so `shell.ts` pulled every item's two numeric columns and counted in JS. New
  **`public.inventory_low_stock`** view (security_invoker); the badge is now a head `count: 'exact'` —
  **no rows transferred**. Scoped by the caller's server-resolved `business_id` (service client), never
  `auth.uid()`.
- **Recipe COGS (MED-7).** `listRecipeCostLines` read `recipe_line` + `inventory_item` separately and
  joined in JS. New **`public.recipe_cost_line`** view does the join in the DB (one round trip). It
  **LEFT JOINs + coalesces to 0**, reproducing the old JS semantics *exactly* (a line whose ingredient
  is missing contributes 0, not a dropped row), so COGS / Est. Net Profit reconcile unchanged.

### Pagination & security notes
- **Page size 20** (`lib/db/list.ts`), **offset/range** pagination (the brief allowed "cursor or range
  on created_at"). Chose range over keyset because bookings sort by a *nullable* `date` (keyset there is
  awkward); orders order by `(created_at desc, id desc)` for a stable total order. Range bounds the
  transferred set — the actual defect — and the existing `(business_id, created_at desc)` /
  `(business_id, date)` indexes cover the ORDER BY. Keyset is a future option if a tenant's history
  grows into deep pages.
- Both views are **`security_invoker = on`** (PG17): an authenticated caller sees only its own tenant's
  rows (base-table RLS evaluated as the querier); service-role cached callers bypass RLS and still
  filter `business_id` explicitly — exactly as with the base tables. Views open no cross-tenant path.
- Search terms are sanitised (`sanitizeSearch`) before interpolation into the PostgREST `ilike`/`.or()`
  grammar (strips `%_,()*"\`), so a term can't break out of the filter. Read actions are still
  Zod-validated with `.strict()` (unknown fields rejected), matching §7.6.
- New i18n keys (`orders.loadMore`/`loading`, `bookings.loadMore`/`loading`) in **both** en + si
  (parity 384/384).

### Verification
- `tsc` + `eslint` + `next build` all green; locale parity confirmed.
- **Migration applied to the hosted project** (`fixyqbmdqvyiukdliijo`, samanthas-bakery / Singapore) via
  `supabase db push` — no local Docker in this environment, so it went straight to the linked cloud DB.
  Registered remotely as `20260714090000`. Verified over the REST API: both views return 200; service
  role sees rows (`inventory_low_stock` count 11 across tenants; `recipe_cost_line` returns joined
  cost rows), and the **anon key sees `[]` for both** — the `security_invoker` RLS gate holds, so the
  views leak nothing cross-tenant. `lib/supabase/types.ts` Views were reconciled against
  `supabase gen types --linked` (Row shapes matched; added the generator's Insert/Update + FK
  Relationships).

### Open questions
- Range pagination can skip/duplicate a row if the underlying set shifts mid-scroll (concurrent
  create/cancel). Negligible for this app's write rate; switch to keyset if it ever matters.
- Tab/segment counts are unfiltered per-tab totals (as before). If the client later wants "N of M for
  the current filter", that's one extra head count per fetch.

---

## 2026-07-13 — PF6: code-split charts, scanner, and locales

Antigravity flagged three heavy client dependencies loaded on routes that don't always use them:
Recharts (HIGH-2), @zxing (HIGH-3), and both locale JSONs shipped on every page (HIGH-4). Each is now
loaded only where/when it's actually needed.

### What changed
- **Recharts (~230 KB), Finance only (HIGH-2).** Split the actual chart into a new
  `components/finance/revenue-bar-chart-view.tsx` (default export, the only module that imports
  `recharts`). `revenue-bar-chart.tsx` is now a thin `"use client"` wrapper that loads the view via
  `next/dynamic(..., { ssr: false, loading })` behind a **skeleton** matching the chart card (label +
  faux bars, DESIGN.md §6). Public `<RevenueBarChart>` API unchanged, so `overview-tab.tsx` is
  untouched. Recharts now lands in an async chunk registered in Finance's `react-loadable-manifest`
  (0 → 1 dynamic module) and loads on the client only when the chart mounts.
- **@zxing (~195 KB), Inventory scan only (HIGH-3).** Removed the top-level `@zxing/browser` +
  `@zxing/library` imports; `IScannerControls` is now a type-only import (erased). The runtime
  `BrowserMultiFormatReader` / `BarcodeFormat` / `DecodeHintType` are `await import()`-ed **inside the
  scan effect** (guarded by `cancelled` after the await), and the format `hints` map + reader are built
  there. So zxing ships as separate chunks fetched when a scan **starts**, not on Inventory page load.
  Verified: the zxing chunks are absent from Inventory's initial root/entry manifests.
- **Locales — active language only (HIGH-4).** `i18n/client.tsx` no longer statically imports
  `en.json` (16 KB) + `si.json` (28 KB) — that shipped **both** on every page. The **active** bundle is
  now delivered by the server (`i18n/server.getLocaleBundle` → root layout → `I18nProvider resources`
  prop) as serialized RSC data, so first paint stays flash-free with **no locale JSON in the client JS
  at all**. The **other** language is dynamic-imported into its own chunk **on demand when switching**,
  via a new exported `changeLanguage(instance, lang)` helper (loads + `addResourceBundle` + switch) that
  the header toggle and Settings now call instead of `i18n.changeLanguage` — consistent with PF3's
  instant client switch. Safe because en/si are at **full key parity (380/380, 0 missing either way)**,
  so the missing-key fallback to `en` never needs an unloaded bundle.
- **Sinhala font not preloaded (font bullet).** `lib/fonts.ts`: Noto Sans Sinhala → `preload: false`.
  next/font emits no `<link rel="preload">` for it, so the English majority never pays for it; the
  browser only fetches the files when the `font-sinhala` class renders Sinhala glyphs. Trade-off: a
  Sinhala user takes a one-time swap (FOUT) on first paint instead of a preload — a per-request
  conditional preload isn't expressible in a single next/font declaration.

### Before / after — First Load JS (gzip; sum of eager root + page client chunks, prod build)
Measured by rebuilding with the changes stashed (BEFORE) vs applied (AFTER); same method both runs.
| Route | BEFORE | AFTER | Δ |
|---|---|---|---|
| **Finance** | 324.4 KB | **218.8 KB** | −105.6 KB (Recharts moved to async) |
| **Inventory** | 348.3 KB | **218.7 KB** | −129.6 KB (@zxing moved to async) |
| Dashboard | 223.9 KB | 216.1 KB | −7.8 KB (2nd locale out of shared JS) |
| Orders | 225.1 KB | 217.3 KB | −7.8 KB |
| Login | 216.0 KB | 208.2 KB | −7.8 KB |

Every route is now well under the 300 KB target; the two heavy routes drop ~106 / ~130 KB gz. (My
gzipped baseline for the worst route is 348 KB, not the brief's ~560 KB — likely a different
metric/compression; the before/after here are internally consistent, same measurement both runs.)

- Build + `tsc` + `eslint` all green. Split confirmed via `react-loadable-manifest` (Recharts) and by
  the zxing chunks being absent from Inventory's initial manifests.

### Open questions
- `preload: false` disables Sinhala preload for **everyone** (incl. si users) — acceptable per the
  brief's "if feasible", but if si first-paint FOUT is undesirable we could hand-emit a conditional
  `<link rel="preload">` in the layout when `lang="si"`. Deferred.

---

## 2026-07-13 — PF5: optimize logo asset + add favicon

Antigravity flagged `public/logo.png` (1.34 MB, 1474×1067) loaded with `priority` in the header on
**every** page and as the login LCP element, plus a per-load `/favicon.ico` 404 (LOW-2).

### What changed
- **New `public/logo.webp`** — 480×347, **22.2 KB** (sharp, q82), replacing the 1.34 MB PNG. Sized for
  the largest render (login `h-20` ≈ 110px wide) with headroom for 3× DPR; next/image downsizes further
  per `sizes`. **`public/logo.png` deleted.**
- **`brand-logo.tsx`**: `src` → `/logo.webp`, intrinsic dims → 480×347, and `sizes` is now a **prop**
  (default `"120px"` for the login mark) so next/image fetches a right-sized variant instead of the
  old wrong `sizes="50vw"` (which forced a 640px variant for a tiny logo). `priority` stays opt-in.
- **`app-header.tsx`**: dropped `priority` (the h-7 ≈ 38px header mark is **not** the LCP — it was
  eagerly loaded on every page, competing with the real LCP) and set `sizes="40px"`. Login keeps
  `priority` (its LCP-area element); print report unchanged.
- **`app/favicon.ico`** (LOW-2): 3-size ICO (16/32/48) rendered from the existing SB-monogram SVG
  (`logo-placeholder.svg`) via sharp + png-to-ico. App Router serves it at `/favicon.ico` → no more 404.
- Monogram SVG fallback for missing **tenant** logos (`components/ui/logo.tsx`) untouched, per brief.

### Before / after (throttled ~1.6 Mbps / 150 ms RTT, 390px @3×)
| | BEFORE (logo.png, sizes=50vw) | AFTER (logo.webp, corrected sizes) |
|---|---|---|
| Committed source asset | 1,376,427 B (1.34 MB) | **22,770 B (22.2 KB)** — 98.3% smaller |
| Login logo variant served | `w=640` → **26.0 KB** | `w=384` → **12.3 KB** (~53% smaller) |
| Header logo per page | `w=640` ≈ 26 KB, **priority/eager** | `w=128` = **3.0 KB**, lazy (~88% smaller) |
| `/favicon.ico` | **404** every load | **200** `image/x-icon` |
| Login LCP time | 3544 ms (prod) | 648 ms (local prod build) |

Caveat on the LCP-time row: BEFORE was measured on the production CDN, AFTER on a local prod build (no
origin RTT), so the absolute ms are **not** apples-to-apples — the infra-independent, comparable wins
are the byte reductions above. Also, in both runs the LCP *element* resolved to the subtitle `<p>`, not
the logo image; the logo optimisation still helps by cutting bandwidth contention during load and by
making the every-page header mark ~9× smaller and no longer eager. A production deploy will give the
clean prod-to-prod LCP delta.

- Build + `tsc` + `eslint` green. Favicon verified `200 image/x-icon` locally; logo variants measured
  via `/_next/image`.

### Deployed & verified on production (2026-07-13, dpl_…72w3hc02j)
Clean prod-to-prod now (both on the Vercel CDN, same throttling ~1.6 Mbps / 150 ms):
- **Login LCP: 3544 ms → 1780 ms** (≈50% faster, −1.76 s); login logo bytes **26.0 KB → 12.3 KB**.
- **`/favicon.ico`: 404 → 200** (`image/vnd.microsoft.icon`, 15 KB); `<link rel="icon">` present + resolves.
- **`/logo.png`: 404** (removed); **`/logo.webp`: 200** (22.8 KB); real-browser check confirms the logo
  `<img>` renders (naturalWidth 120, not broken), served as `/_next/image?url=/logo.webp&w=384`.

---

## 2026-07-13 — PF4: pending bottom-nav state + login loading skeleton

Acting on PF0's finding that the bottom nav was a plain `<Link>` with no pending state — a tap gave
zero feedback until the destination skeleton mounted, which on any latency reads as a freeze.

### What changed
- **Bottom nav** (`components/nav/bottom-nav.tsx`): extracted the link's inner content into
  `NavItemContent`, which reads Next 16 **`useLinkStatus()`** (the nearest parent `<Link>`'s pending
  state). On tap the item reacts immediately — **lights up in brand red** and its **icon becomes a
  spinner** (`Loader2 animate-spin`) for the duration of the navigation, before the destination loads.
  Colour/`group-hover` moved off the `<Link>` onto the content span so pending can drive it.
- **Login loading skeleton**: new `app/(auth)/login/loading.tsx` + `components/auth/login-skeleton.tsx`
  (Antigravity MED-6) — shape-matched pulse blocks (logo, title/subtitle, two fields, CTA) mirroring the
  login card, so the screen isn't blank while the route's auth check resolves.
- **Action buttons spot-check**: create order, add expense, create booking, and **all** settings forms
  (business profile, tax, notifications) + the login form already carry pending states via
  `useActionState` (`disabled={pending}` + a "saving…"/"submitting…" label). Nothing missing — no change
  needed.

### Motion / reduced-motion (DESIGN.md §4/§7)
Restrained and reduced-motion aware. The nav spinner is `animate-spin` **`motion-reduce:hidden`**, and
the icon it replaces is `opacity-0 **motion-reduce:opacity-100**` — so under `prefers-reduced-motion`
(globals.css zeroes all animations) there is no frozen spinner: the icon stays put and the **instant
brand-red colour change carries the feedback on its own**. Skeletons use the existing `animate-pulse`
convention, also disabled by the global reduced-motion rule.

### Verification (local prod build, headless Chromium + throttling)
- **Nav pending — live PASS:** logged in, throttled the network, clicked Dashboard→Finance; the tapped
  item showed **`aria-busy="true"` AND the spinner** (`.animate-spin`) during the transition.
- **Login skeleton — PASS via streamed HTML:** `GET /login` streams the skeleton as the Suspense
  fallback — the response contains the 8 `bg-border` skeleton bars + `animate-pulse` + `aria-hidden`
  **ahead of** the real form (`name="password"`) in the same document — proving the skeleton paints
  first on a hard load whenever the auth check has any latency (its whole purpose). Build + `tsc` +
  `eslint` all green.

### Deployed & verified on production (2026-07-13, dpl_…bbw5kb1ia)
- **Nav pending — live PASS on prod:** logged in as the demo owner, throttled, clicked
  Dashboard→Finance; the tapped item showed **`aria-busy="true"` AND the spinner** during the hop.
- **Login skeleton — PASS on prod:** `GET https://smt-bakery-management.vercel.app/login` streams the
  skeleton fallback (`animate-pulse` + `bg-border` + `aria-hidden`) ahead of the real form.
- Region unchanged (`sin1::sin1`).

---

## 2026-07-13 — PF3: instant client-side language switch (EN ↔ SI)

Acting on PF0's finding that the language toggle called a server action doing
`revalidatePath("/", "layout")` — a full server re-render + refetch of the whole shell **and** the
current route across the region gap, one of the heaviest interactions in the app. Now the switch is
pure client-side and instant.

### What changed
- **Toggle + Settings picker switch client-side immediately** (`components/nav/language-toggle.tsx`,
  `components/settings/language-setting.tsx`): `onClick` calls `i18n.changeLanguage(next)`, so every
  `useTranslation` string re-renders at once — no navigation, no server re-render, no selector refetch.
  Both controls had to change: both previously relied on the removed `revalidatePath` to make the UI
  follow.
- **`i18n/client.tsx`**: `<html lang>` + the Sinhala body font are now synced via a `languageChanged`
  listener on the i18n instance (fires on any client switch), instead of via the server-prop effect.
  The server prop still seeds first paint (SSR correctness) and a later prop change is still followed.
- **Persist is fire-and-forget** (`void setLanguage(next).catch(() => {})`): the UI has already
  flipped; a failed write is swallowed (worst case: the next fresh load starts in the old language).
- **`app/(app)/actions.ts`**: removed `revalidatePath("/", "layout")` (and the now-unused import) from
  `setLanguage`; it now only persists `profile.language_pref`.

### "No server round trip" — confirmed from the Next runtime source (not memory)
The prompt asked to confirm no server round trip fires on toggle. Rather than assume, I checked
`next/dist/server/app-render/action-handler.js` (lines 874/901): the page is re-rendered only when
`workStore.pathWasRevalidated` is set to something other than `ActionDidNotRevalidate` —
i.e. **`skipPageRendering = true` unless the action called `revalidatePath`/`revalidateTag`/`updateTag`.**
Since `setLanguage` no longer revalidates, Next **skips re-rendering the route's Server Components** —
no RSC refetch, no selector re-run across the region gap. The only server contact left is the
intended lightweight background persist POST (the server action), which returns with **no RSC payload**;
the visible language flip is 100% client-side and does not wait on it. This is exactly the PF0 round
trip eliminated.

### Notes / correctness
- First paint stays correct: the root layout resolves the language server-side and the i18n instance is
  created with it, so SSR and hydration agree (no flash). `getProfile` is not in PF2's data cache
  (identity, per-request only), so a later fresh load reads the newly-persisted `language_pref`.
- Dropped `useTransition`/`pending` from both controls — nothing is awaited, so there's no pending
  state to show; the disabled styling went with it.
- Numerals/dates stay Arabic in both languages (CLAUDE.md §3) — untouched.
- Build + `tsc` + `eslint` pass.

### Live verification (deployed & confirmed 2026-07-13, prod alias)
Logged in as the demo owner and clicked the header toggle on `/dashboard` (headless Chromium):
- `html lang: si → en`, `body.font-sinhala: true → false`; nav `"උපකරණ පුවරුව" → "Dashboard"`, toggle
  `"EN" → "සිං"` — the whole UI re-rendered in the new language.
- **URL unchanged, 0 document navigations** during the toggle → no reload/re-render round trip.
- Exactly **one** network call fired: a POST to `/dashboard` with `Next-Action` set (`isServerAction:
  true`) — the fire-and-forget persist, which returns no RSC payload (confirming the `skipPageRendering`
  path). All four assertions PASS.
- Bonus: earlier clicks had persisted the owner to `si` across sessions; this run flipped it back to
  `en` — read-your-own-writes persistence confirmed too.

---

## 2026-07-13 — PF2: tagged data cache for the money selectors + shell reads

Acting on PF0's finding that `cache=MISS` on 100% of route hits — every Dashboard / Finance / Reports
figure is recomputed from fresh cross-region reads on every load, though these figures change only on
a write. Added a per-tenant, tag-invalidated **data cache** so repeat navigations are instant and the
numbers stay correct. This is also the primary mitigation if PF1's `sin1` move is ever unavailable
(it removes the data round trips entirely; only the identity call remains).

### The core constraint that shaped the design
A Next cache scope (`unstable_cache` **or** `use cache`) **cannot read `cookies()`**, and its result is
keyed by explicit inputs, not by the request session. But our only DB client is the cookie-based **RLS**
client. So a cached, business-scoped read cannot use it. Resolution:
- **Identity stays uncached and on RLS** (`auth.getUser` / `getProfile`) — resolved *before* the cache,
  exactly as CLAUDE.md and the prompt require.
- **Cached reads use a new service-role client** (`lib/supabase/service.ts`), scoped by an **explicit
  `.eq("business_id", …)`** on every query, where the id was resolved server-side from the caller's own
  profile (never client input). The client + id travel together as a `DbScope` so a service read can
  never run without its filter.
- Chose **`unstable_cache`** over `use cache`: the latter needs `cacheComponents: true`, a repo-wide
  rendering-model flip (static-by-default + Suspense audits everywhere) — too broad and risky for this.
  No `next.config` change was needed.

### ⚠️ Security deviation (flagged per CLAUDE.md §3) — reviewed, contained
Cached **reads** now go through the service_role key, which **bypasses RLS**. Tenant isolation for those
reads is therefore enforced by (a) an explicit `business_id` filter on every service query, (b) the
`business_id` baked into each cache key **and** tag, and (c) the id only ever coming from the
authenticated profile. Guardrails: `service.ts` is `server-only` + `getServiceRoleKey()` (throws in the
browser, never `NEXT_PUBLIC_`); the client is **reads-only** — **every mutation still uses the RLS
client** so the DB enforces tenancy on all writes. This is the standard way to make a business_id-keyed
cache work and is sanctioned by the existing `getServiceRoleKey()` accessor, but it *is* a real widening
of the read surface and should be part of the final security audit (§7).

### What changed
- **New** `lib/supabase/service.ts` (service client), `lib/db/cache.ts` (`DbScope`, `businessTags`,
  `revalidateBusinessTags`), `lib/db/queries/business.ts` (cached business row).
- **Queries** (`orders`, `expenses`, `bookings`, `pricing`) take an optional `DbScope`: with it →
  service client + explicit `business_id`; without it → unchanged RLS path (so the Orders/Bookings/
  Inventory/Expenses **screens** and all mutations are untouched).
- **Selectors** wrapped in `unstable_cache`, keyed `[name, businessId, startUtc|endUtc|timezone]`:
  - `dashboard` → tags `orders, expenses, pricing`
  - `finance` overview → `orders, expenses, bookings, pricing`; platform earnings → `orders, pricing`
  - `reports` daily → `orders, pricing`
  - `shell` badges → `notifications, inventory, menu`
  Each selector's aggregation was split into a **pure `summarize*`** function reused by both the cached
  fetch path and a zeroed empty-tenant guard — `_shared.ts` (the canonical money rules) is **untouched**,
  so figures reconcile across screens exactly as before; the cache changes *when* they're computed, never
  *what*.
- **`getBusiness`** (`lib/auth.ts`) now serves the row from the cached loader (tag `business:{id}`),
  keeping identity resolution on RLS. Removes a shell round trip on repeat loads.
- **Mutations** invalidate exactly what they change via `revalidateBusinessTags`: order→`orders`,
  expense→`expenses`, booking→`bookings`, inventory add→`inventory`, settings→`business` (a timezone
  change reshapes every period, which the `business` tag flows through). Existing `revalidatePath` calls
  are **kept** (they refresh the uncached screens + router cache); tag invalidation is additive.

### Next 16 invalidation API (verified against installed source, not memory)
`next@16.2.10` changed the cache API: one-arg `revalidateTag(tag)` now logs a **deprecation warning**
(wants a `'max'`/CacheLifeConfig 2nd arg), and a new **`updateTag(tag)`** exists. Inspected
`dist/.../revalidate.js`: both funnel through the same internal `revalidate()` → `encodeCacheTag`, so
both **do** expire `unstable_cache` tags. `updateTag` gives **immediate expiration + read-your-own-writes**
and is **Server-Action-only** — which matches every one of our mutation call sites — so the acting user
sees fresh figures on the very next render, not a stale cached total. Chose `updateTag`.

### Which mutations do NOT need new tags (verified)
- `create_order` does **not** deduct stock (grep: no `qty_on_hand` write in the RPC/triggers) → order
  creation doesn't touch the inventory low-stock badge; `orders` tag only.
- No runtime writers exist for `notification` or `menu_item` availability (seed-only) → those shell tags
  are correct but currently future-proofing.
- `setLanguage` writes `profile` (identity, uncached) → keeps `revalidatePath("/","layout")`, no tag.

### Verification
- **Build + typecheck + lint pass** (`next build`, `tsc --noEmit`, `eslint`) — all routes still dynamic.
- Reconciliation is preserved **by construction** (aggregation untouched; service reads return the same
  tenant rows RLS did). A **live** cache-HIT + seed-reconciliation check needs an authenticated session
  against the DB (local Supabase isn't running; `.env.local` targets the hosted project) — deferred to a
  post-deploy pass, same as PF0/PF1's credentialed measurements. Signal to confirm then: repeat
  dashboard→finance→reports nav shows cache HITs (no per-figure DB reads in logs), and a new order/expense
  immediately updates the totals (read-your-own-writes via `updateTag`).

### Open questions
- Post-deploy: confirm HIT/MISS in Vercel runtime logs and that figures reconcile against seed.
- The service-role read path should be explicitly re-reviewed in the final §7 security audit.

---

## 2026-07-13 — PF1: colocate Vercel functions with the Supabase region (`sin1`)

Acting on PF0's #1 finding (region mismatch dominates every latency figure). Vercel functions ran in
**`iad1` (US-East)** while Supabase is **`ap-southeast-1` (Singapore)** — ~15,000 km, paid per
sequential `await`. Fix: pin the function region to Singapore so the cross-region gap collapses to an
intra-region hop (~1–5 ms).

### What changed
- **New `vercel.json`** (repo had none) with `{ "regions": ["sin1"] }` + the `$schema` ref. `sin1` is
  Vercel's Singapore region — same city as Supabase `ap-southeast-1`, so functions now sit next to the
  DB/auth server.
- Confirmed the correct config location for **Next 16 on Vercel**: the project-level default region is
  the `regions` key in `vercel.json` (per Vercel docs, `functions/configuring-functions/region`). This
  is the framework-agnostic, plan-safe location; `vercel.ts` (`@vercel/config`) exposes the same
  `regions` key but would add a dependency for a one-line setting, so `vercel.json` was chosen. No
  `preferredRegion` per-route export is needed — the project default covers all functions incl.
  middleware.

### Plan restriction check
- **No blocker.** A **single** default region in `vercel.json` (`["sin1"]`) is available on *all*
  plans. Only **multi-region** arrays and `functionFailoverRegions` require Pro/Enterprise — we use
  neither. So PF2 (caching) remains a *complementary* win, not a forced fallback. (Caveat that still
  holds regardless of region: the transpacific/client RTT from a far-away visitor to the `sin1` edge
  is the floor on any *uncached* read; colocation removes the function↔DB gap, not the client↔edge
  one — which is why PF2 caching is still worth doing.)

### Middleware / auth boundary (verified, unchanged)
- `middleware.ts` → `lib/supabase/middleware.updateSession` does exactly **one** `supabase.auth.getUser()`
  per request (plus the per-request CSP nonce) — the validated-identity call at the protected-data
  boundary. **Not weakened**: identity is still revalidated against the auth server on every request;
  the region move is what makes that call cheap (was ~1 cross-region RTT, now an intra-region hop). No
  extra DB reads live in the middleware.

### Measurement (before / after)
Measured against the live production domain from a machine near the Mumbai (`bom1`) edge. The
`x-vercel-id` header names `<entry-edge>::<exec-region>`, which is the ground-truth region proof.

- **BEFORE (current iad1 deploy), `GET /login` (unauth, `x-vercel-cache: MISS`):**
  - `x-vercel-id: bom1::iad1` → request enters at bom1, **function executes in iad1**. ✅ confirms the
    mismatch analytically predicted in PF0.
  - TTFB: cold **1.98 s**, warm **~0.50 s** (0.573 / 0.503 / 0.504 / 0.514 s over 4 warm samples).
    TCP+TLS to the bom1 edge ≈ 0.13–0.18 s; the remaining ~0.35 s is edge→iad1 function hop + work.
- **AFTER (deployed & confirmed 2026-07-13, dpl_BRHLHz6…):** `GET /login` now returns
  `x-vercel-id: **sin1::sin1**` — function executes in Singapore, colocated with Supabase — stable
  across 10/10 samples (was `bom1::iad1`). Login TTFB: warm **~0.29–0.55 s** (best ~0.29 s vs the
  ~0.50 s iad1 warm baseline). NOTE: `/login` is unauthenticated and makes no DB round trip, so it
  understates the win — the real payoff is on authenticated pages where each shell/selector Supabase
  round trip (PF0's ~4× getUser→profile→business→badges) drops from ~230 ms to an intra-region
  ~1–5 ms. Measuring that authenticated soft-nav (dashboard→finance) number still needs a test
  session; deferred to a credentialed pass.

### Open questions
- Post-deploy: capture real authenticated before/after with credentials + `console.time` per-fetch
  timers (the PF0 "instrumentation" follow-up) to put a hard number on the shell round trips.
- The entry edge stays `bom1` for a Mumbai visitor; for Sri Lankan (Colombo) end users the nearest
  Vercel edge is still `sin1`/`bom1` — no change, and the colocation win is independent of visitor
  location.

---

## 2026-07-12 — Performance diagnosis (measurement pass — NO code change)

Read-only investigation into where navigation/render time goes. **No application code was
touched.** One process note up front: the prompt asked to "wrap key server fetches in
`console.time`" *and* to "change NO application code" — those conflict, so per CLAUDE.md I kept the
hard constraint (no code change) and report timing **analytically** (round-trip count × measured
cross-region RTT) plus what Vercel's logs already expose. Live per-fetch timers are a follow-up that
needs a one-line-per-fetch code change (see "Instrumentation" below).

### TL;DR — ranked "where the time goes"

1. **Region mismatch (dominant).** Vercel functions run in **`iad1` (US-East, Washington DC)**;
   Supabase is **`ap-southeast-1` (Singapore)**. ~15,000 km ⇒ **~220–260 ms RTT per round trip**.
   Every Supabase call (auth + every DB read) pays this, and the app makes several **sequential**
   round trips per navigation, so the penalty multiplies. This is the single biggest lever.
2. **Middleware auth round trip on *every* request** (incl. soft-nav RSC fetches): ~1 cross-region RTT
   before the function even starts.
3. **(app) shell layout: ~4 sequential cross-region round trips**, and they sit **above
   `loading.tsx`** — on a hard load / refresh nothing (not even the skeleton) paints until they
   finish (~0.9 s of pure latency).
4. **`getOrdersList` → `listAllOrdersWithItems()` is unbounded** — pulls *every* order + all line
   items, no date scope / no `LIMIT` / no pagination; all filtering is client-side. Fine at demo
   size, but the one query that degrades linearly forever.
5. **Nothing is cached** — Vercel runtime logs show `cache=MISS` on 100% of route hits; every figure
   is recomputed from fresh cross-region reads on every load.
6. **Language switch = full server re-render** (`revalidatePath("/", "layout")`), not a client-only
   `i18n.changeLanguage`; re-runs the whole shell layout + current route across the region gap.
7. **Nav links have no pending state** — a tap gives zero feedback until the destination skeleton
   mounts.

---

### 1. Infra / region

- **No `regions` config anywhere** — no `vercel.json`, no `vercel.ts`, nothing in `next.config.ts`.
  Confirmed via the Vercel project API (`smt-bakery-management`, `prj_yGToIoqqu…`): framework
  `nextjs`, node `24.x`, no region override ⇒ functions run in the account default **`iad1`
  (US-East / Washington DC)**.
- **Supabase = `ap-southeast-1` (Singapore)** per CLAUDE.md (`fixyqbmdqvyiukdliijo` project; modern
  Supabase URLs no longer encode region in the host, so the source of truth is CLAUDE.md).
- **Implied RTT ≈ 220–260 ms** per round trip (iad1↔Singapore). Cross-region is paid **per await**,
  and most of the hot path is sequential (below). Same-region (moving Vercel functions to `sin1`)
  would cut each of these to ~1–5 ms.

### 2. Layout / shell cost (`app/(app)/layout.tsx` — above `loading.tsx`)

The shell awaits three helpers **in series** (`layout.tsx:14-16`):

| Call | What it fetches | Aggregate or rows? | Cached? | Round trips |
|---|---|---|---|---|
| `requireProfile()` (`lib/auth.ts:70`) | `auth.getUser()` (`auth.ts:30`) **then** `profile` select (`auth.ts:39-45`) | 1 row | React `cache()` per-request only | **2** (auth RTT + DB RTT), sequential |
| `getBusiness()` (`lib/auth.ts:48`) | `business` select (`profile` is cached) | 1 row | per-request `cache()` | **1** DB RTT |
| `getShellBadges()` (`lib/db/selectors/shell.ts:20`) | see below | mixed | per-request `cache()` | **1** DB RTT (batch) |

`getShellBadges` (`shell.ts:23-31`) runs 3 queries in **one `Promise.all`** (so 1 RTT):
- `notification` → `count: exact, head: true` — **COUNT only, no rows** ✅
- `menu_item` (unavailable) → `count: exact, head: true` — **COUNT only** ✅
- `inventory_item` → **pulls `qty_on_hand, low_stock_threshold` rows**, counts low-stock in JS
  (`shell.ts:33-35`) — a column-vs-column comparison PostgREST can't express as a filter. Small
  per-tenant table, so acceptable, but it *is* a row transfer, not an aggregate.

**Net: ~4 sequential cross-region round trips in the shell** (getUser → profile → business →
badges) ⇒ **~0.9 s of pure latency** before `loading.tsx` can paint on a hard load.

- **Nuance vs. the prompt's premise ("layout blocks *every* route transition"):** in the App Router a
  **shared layout persists and does NOT re-run on soft (client-side `<Link>`) navigation** between
  sibling routes under `(app)`. So these 4 round trips are paid on **initial load / hard refresh**
  and on **`revalidatePath("/", "layout")`** (the language switch) — **not** on dashboard→finance
  soft nav. What *is* paid on every soft nav is the **middleware** `auth.getUser()` (§4), because the
  RSC fetch to the new path still passes the middleware matcher.

### 3. Per-route queries

All selectors are `server-only`, RLS-scoped (tenant isolation at the DB, no explicit `business_id`
filter), wrapped in React `cache()` (per-request dedupe **only** — no cross-request/data cache), and
every page fetches **behind a `<Suspense>`** boundary so sections stream after a skeleton. Within a
selector the awaits are **parallel** (`Promise.all`); **all aggregation is done in Node**, none in
SQL.

- **Dashboard** — `getDashboardSummary` (`selectors/dashboard.ts:58-63`): `Promise.all` of
  `listOrdersWithItems(period)` + `listExpenses(period)` + `listCommissionRules()` +
  `listRecipeCostLines()`. Orders/expenses are **date+tenant scoped at the DB**
  (`queries/orders.ts:28-30` `gte/lt created_at`; `queries/expenses.ts:20-22`). Money rolled up in JS
  via `aggregateOrders` (`_shared.ts:135`). 1 RTT (all parallel). Streams.
- **Finance** — `getFinanceOverview` (`selectors/finance.ts:59-65`): `Promise.all` of 5 (orders,
  expenses, bookings, rules, recipe lines), all date-scoped at DB. Aggregation in Node. The
  **Platform Earnings** tab (`getPlatformEarnings`, `finance.ts:122`) independently re-fetches
  `listOrdersWithItems(period)` — harmless because the tabs are mutually exclusive (only one renders),
  but note neither `listOrdersWithItems` nor the raw queries are `cache()`-wrapped, so if a single
  render ever needed both selectors it would double-fetch. Streams.
- **Inventory** — `getInventoryList` (`selectors/inventory.ts:52-53`): single `listInventoryItems()`
  — **all tenant rows, `select("*")`, ordered by name, no pagination** (`queries/inventory.ts:15-23`).
  Low-stock flag + count computed in **JS** (`inventory.ts:66,72`). Small table; fine.
- **Orders** — `getOrdersList` → **`listAllOrdersWithItems()` (`queries/orders.ts:43-52`)**:
  ⚠️ **`select("*, order_item(*)")` for EVERY order of the tenant, no date scope, no `LIMIT`, no
  pagination.** The screen's Active/Archived tabs + source/status/payment/date filters all run
  **client-side in JS** over the full set (`selectors/orders.ts:47-59`). At demo volume it's nothing;
  architecturally it's the query that grows without bound and will dominate the Orders route as the
  shop accumulates history. Every column of both tables is pulled. Streams.
- **Reports** — `getDailyReport` (`selectors/reports.ts:72`): `Promise.all` of
  `listOrdersWithItems(period)` + `listCommissionRules()`, date-scoped at DB, aggregation in Node,
  plus a per-order detail table. 1 RTT. Streams.

**Cross-cutting:** aggregates (revenue, commission, COGS, by-source/by-payment, per-day) are all Node
loops/`Map`s in `_shared.ts` — correct and consistent, but recomputed on **every** request because
there is **no data cache** (`cache=MISS` on 100% of route hits in the runtime logs). For a demo whose
figures only change on a mutation, these are prime `unstable_cache`/`"use cache"` + tag-invalidation
candidates.

### 4. Language switch

`components/nav/language-toggle.tsx:27` → `startTransition(() => setLanguage(next))` →
**server action** `setLanguage` (`app/(app)/actions.ts:23-35`): validates, writes
`profile.language_pref`, then **`revalidatePath("/", "layout")`**. That invalidates the **entire app
layout tree**, so the switch triggers a **full server re-render + refetch** of the `(app)` shell (all
~4 cross-region round trips of §2) *and* the current route's selectors — an `await` the button blocks
on. It is **not** a client-only `i18n.changeLanguage`; the client `changeLanguage` in
`i18n/client.tsx:48-58` only *mirrors* the already-committed server change to avoid a flash. So a
language toggle is one of the heaviest interactions in the app.

- **Noto Sans Sinhala is loaded on every page regardless of language.** `lib/fonts.ts:21` declares it
  via `next/font/google`, and `app/layout.tsx:32` always includes `notoSansSinhala.variable` in the
  `<html>` className; it's only *applied* when `lang="si"` (`layout.tsx:35`). `display:swap` means it
  isn't render-blocking, but the Sinhala webfont files are still fetched for English-only users.

### 5. Pending / transition UI

- **Bottom nav (`components/nav/bottom-nav.tsx:40`): plain `<Link>`, no `useLinkStatus`, no
  transition, no active-press pending.** A tap gives **zero feedback** until the destination's
  `loading.tsx` skeleton mounts — which, on the region-latency budget above, is a visible dead gap.
  This is the highest-value cheap UX fix.
- **Has** pending state: `LanguageToggle` (`disabled={pending}`, `language-toggle.tsx:16,25`),
  Settings `language-setting.tsx` (`useTransition`). Finance/Reports period + report controls push
  the URL via `useRouter` and rely on the `<Suspense key>` skeleton rather than an explicit button
  spinner.

### Instrumentation (not applied — would be a code change)

Vercel's runtime-log API for this project returns status + `cache` state (all **MISS**) but **no
per-request duration** and no per-fetch timing. Getting real numbers needs a small code change:
wrap the raw queries in `lib/db/queries/*` (or the selectors) in `console.time`/`performance.now()`
and read them back via `get_runtime_logs`. Deferred to honour "no code change" this pass. The
analytical model above (round-trip count × ~230 ms cross-region RTT) is the reliable estimate until
then; the highest-confidence single number is the region RTT, which dominates everything else.

---

## 2026-07-12 — Brand logo on login, app header, and printed reports/bills

- Moved `logo.png` → **`public/logo.png`**. New **`BrandLogo`** component (`components/ui/brand-logo.tsx`)
  renders it via `next/image`, height-driven with `w-auto` (the logo is landscape 1474×1067, so it must
  not be cropped — distinct from `<Logo>`, which is the square tenant-uploaded logo + monogram).
- **Login screen:** replaced the "SB" monogram with `BrandLogo` (h-20, priority).
- **App header (top-left of every screen):** `BrandLogo` (h-7) linking to `/dashboard`, before the title.
- **Printed bill/report:** there is no per-order receipt in the app, so the printable **Reports** page
  is the "bill". Added a print-only branded header (logo + business name + report type + date) at the
  top of `DailySalesReport`, and `print:hidden` on the app header, bottom nav, and report controls, so
  `Print / PDF` produces a clean branded document. (CSV export can't carry an image, so it's unchanged.)

---

## 2026-07-12 — FIX: orders never created — zod .uuid() rejected seed menu ids (real root cause)

**The actual reason "can't create orders" (POST /orders returned 200 but no order was created):**
`lib/zod/order.ts` validated `menuItemId` with `z.string().uuid()`. zod v4's `.uuid()` enforces an
RFC-9562 version/variant, but the **seed menu ids are vanity UUIDs** (`eeeeeeee-0000-0000-0000-
000000000004`, version nibble `0`) that fail that check. So `newOrderSchema.safeParse` failed for
**every** order built from seeded items, and the server action returned `orders.new.error`
("Couldn't create that order") before ever calling the RPC. The RPC/DB were always fine — my earlier
tests hit the RPC directly (REST), bypassing zod, which is why they passed and hid this.

**Fix:** `menuItemId: z.guid()` — accepts any 8-4-4-4-12 hex id (seed + real) without the RFC version
constraint. Not a security regression: `create_order` re-validates every id belongs to this tenant's
AVAILABLE menu server-side (§7.7). Verified: schema now accepts seed ids, still rejects `not-a-uuid`.

Note: this supersedes the earlier assumption that the middleware refresh-token 500 was the order-
creation cause — that was a separate real bug; THIS was the blocker for creating orders from seed data.
`.uuid()` is used in exactly one place (the order schema), so no other mutation was affected.

---

## 2026-07-12 — Fix bottom-nav label overlap (owner's 9-item bar)

**Bug:** on the Employees screen (and any screen for an owner) the bottom-nav labels overlapped each
other. Root cause: each `<li>` was `flex-1`, which SHRINKS items to equal width. With 9 items
(owner/manager) on a ~390px phone that's ~43px per item, but labels like "Dashboard"/"Employees" are
~55px, so the un-clipped labels spilled out of their cells and collided — defeating the horizontal
scroll the nav comment intended. (Content-vs-nav clearance was fine: `main` already pads
`calc(72px + env(safe-area-inset-bottom))`, verified in the deployed CSS.)

**Fix (`components/nav/bottom-nav.tsx`):** items are now `shrink-0 grow` with `whitespace-nowrap`
labels — they grow to fill when there's room (few items), but never shrink below their label width,
so with 9 items the row scrolls horizontally (as intended) instead of overlapping. Bumped item
padding `px-1 → px-2`. Build + lint clean.

---

## 2026-07-12 — Harden Supabase auth defaults (config.toml + hosted project)

**What changed** (`supabase/config.toml [auth]`, applied to the hosted project via `supabase config push`):

- `enable_signup = false` (top-level `[auth]` master switch) — no public registration.
- `minimum_password_length = 12`; `password_requirements = "lower_upper_letters_digits"`.
- `enable_confirmations = true` (verify email before sign-in); `secure_password_change = true`.
- Recorded all of these as fixed defaults in **CLAUDE.md §7 (item 11)** so future work won't loosen them.

**Two corrections discovered while pushing (config push syncs the WHOLE `[auth]` block, not just 5 keys):**

1. **`[auth.email].enable_signup` must stay `true`.** I first set it to `false` too ("defense in
   depth"); the push then returned `email_provider_disabled` (HTTP 422) — that toggle is the email
   PROVIDER switch (`EXTERNAL_EMAIL_ENABLED`), so false disables email/password **sign-in** for
   everyone, including the demo accounts. Reverted to `true` and re-pushed; public registration is
   still blocked by the top-level `enable_signup = false` (`disable_signup: true`). Documented in the
   config comment + CLAUDE.md §7.
2. **`site_url` was clobbered to `http://127.0.0.1:3000`.** config push had synced config.toml's
   localhost value to the hosted project (the re-push diff confirmed `-site_url = "http://127.0.0.1:3000"`).
   That would break confirmation/recovery email links in prod. Set config.toml `site_url` to the
   production URL (`https://smt-bakery-management.vercel.app`) and kept localhost in
   `additional_redirect_urls`; re-pushed. **config.toml is the source of truth** (config push), not the
   dashboard.

**Verified**

- All three seed users still sign in (HTTP 200) — they were already `email_confirmed_at`-set on the
  hosted project (and the seed sets it via `now()`), so confirmations-on doesn't lock them out.
- Live `/auth/v1/settings`: `disable_signup: true`, `mailer_autoconfirm: false`, `external.email: true`.
- Note: seed demo passwords (`Owner#12345` = 11 chars) are below the new 12-char minimum, but that is
  only enforced at signup/password-change — existing users sign in fine. Left as-is (documented creds).

---

## 2026-07-11 — Close minor security gaps (svg mime, csv injection, zod dep)

Three independent hardening fixes from the audit:

1. **zod is now a direct dependency.** `npm ls zod` showed it was only present transitively (via
   `eslint-config-next` → `eslint-plugin-react-hooks`). `npm install zod` (^4.4.3) makes it explicit
   in `package.json`; lockfile committed. (We import `zod` directly across `lib/zod/*`, so relying on
   a transitive copy was fragile — a dep tree change could remove it.)

2. **SVG logo upload removed.** SVG is XML and can embed `<script>`, so an uploaded SVG logo served
   back is a stored-XSS vector. Dropped `image/svg+xml` from `LOGO_MIME_EXT` (`lib/zod/settings.ts`)
   and from the logos bucket's `allowed_mime_types` via a NEW migration
   `20260711004619_logos_drop_svg_mime.sql` (migration 003 left untouched). Kept png/webp/jpeg.
   Applied to the linked DB (`db push`); verified the bucket now lists only png/jpeg/webp.

3. **CSV formula-injection escaping.** New shared util `lib/csv.ts` (`csvCell` / `csvRow`): any cell
   whose value starts with `=`, `+`, `-`, `@`, TAB, or CR gets a leading apostrophe (so a
   spreadsheet treats it as literal text, not a formula), then RFC-4180 quote-escaping (wrap in
   quotes, double embedded quotes). Wired into the Reports **Daily Sales** CSV export
   (`report-detail.tsx`), replacing its quote-only `csvCell`. Verified with 12 cases incl. an
   `=HYPERLINK(...)` payload. Distinct from MED-05 (HTML): the real CSV risk is spreadsheet formula
   execution on open.

**Note on the "Tax Report export":** it does not exist in the codebase yet — `REPORT_TYPES` ships
only `daily_sales`, and the sole CSV export is Reports Daily Sales. (The `tax` i18n keys belong to
Settings › Tax & Currency, not a report.) The escaping was therefore built as a shared `lib/csv.ts`
utility so the Tax Report export (SPEC §5.3 / CLAUDE.md §8), when implemented, uses it by default —
nothing further to apply today. Flagged rather than scaffolding a whole report feature outside scope.

Build + lint clean.

---

## 2026-07-11 — Atomic order creation via transactional RPC (closes HIGH-04/05, MED-02)

**What changed**

- **New migration `20260710223829_atomic_order_creation.sql`** (added, not a rewrite of applied ones):
  - `business.order_seq bigint` — per-tenant monotonic order counter (default 1000 ⇒ first number
    `ORD-1001`). Backfill lifts each existing tenant's counter above its highest existing order
    number so app-minted numbers never collide with history (cloud tenant → 1190).
  - `private.next_order_seq()` (SECURITY DEFINER, self-scoping) — allocates the next number via
    `UPDATE business SET order_seq = order_seq + 1 WHERE id = current_business_id() RETURNING`; the
    row lock serialises concurrent creates per tenant.
  - `private.commission_rate_bps(source)` (SECURITY DEFINER, self-scoping) — so commission is
    computed correctly for ANY creator role (commission_rule RLS is owner/manager-only, but staff
    create orders too). Reads only the caller's own tenant's rule; never returned to the client.
  - `public.create_order(source, customer_name, payment_method, payment_status, items jsonb)`
    (**SECURITY INVOKER**, pinned `search_path=''`) — in ONE transaction: validates each item
    belongs to the caller's tenant + is available (cross-tenant ids are invisible under RLS ⇒
    rejected), recomputes `unit_price_cents`/`name` from `menu_item` and snapshots them, computes
    subtotal/commission/total server-side, allocates `order_no`, inserts the order + all items, and
    returns the order. `EXECUTE` granted to **`authenticated` only** (revoked from public/anon).
- **`createOrder` server action** now calls `supabase.rpc("create_order", …)` and just Zod-validates
  input first. Deleted the client-side `nextOrderNo`/`listOrderNos` numbering, the two-step
  order+items insert, and the compensating-delete path. Removed `listOrderNos` from `queries/orders`.
- **`seed.sql`** advances `business.order_seq` past the seeded numbers after the order loop, so a
  fresh `db reset` continues from `ORD-<max+1>`.
- **Types** regenerated (`lib/supabase/types.ts`) — `create_order` + `order_seq` now typed.
- **New test `supabase/tests/rls_order_creation.sql`** — asserts (all pass, run `--linked`):
  server-side money recompute; trimmed/null customer name; **unique + monotonic** numbering;
  UNIQUE-constraint rejection of a duplicate `order_no`; **gap-tolerant** numbering (consumed
  numbers skipped, still unique); atomic order_item snapshot; **cross-tenant item id rejected**.

**Order number scheme**

- Old: app read all `order_no`s, parsed max, `ORD-${max+1}` — raced on concurrent creates and was
  fragile past assumptions. New: `ORD-<business.order_seq>`, allocated atomically under a per-tenant
  row lock. **Gap-tolerant** (a rolled-back allocation is never reused); the system relies on
  uniqueness + order, never contiguity.

**Issues closed**

- **HIGH-04** order_no race (concurrent creates minting the same number).
- **HIGH-05** `>1000`-row / duplicate-number bug (app-side text parsing + `max=1000` assumption).
- **MED-02** non-atomic order+items (orphaned total-bearing order on partial failure).

**Applied + verified**

- Pushed migration to the linked DB (`db push`); re-applied the updated function defs idempotently
  (`create or replace`) after adding the commission helper. All 3 RLS test files pass; security
  advisors show no findings on the new functions (only the pre-existing, unrelated
  `leaked_password_protection` Auth warning). Build + lint clean. Live `rpc/create_order` as owner
  returns `ORD-1191` and the correct totals; test order cleaned up, counter reset to 1190.
- Does not contradict the prior middleware / bodySizeLimit / secret-scan work — different layers.

---

## 2026-07-11 — Secret-scan pre-commit hook + tracked-secret audit

**What changed**

- **`.githooks/pre-commit`** — blocks a commit whose staged changes contain credential shapes
  (JWTs, `-----BEGIN … PRIVATE KEY-----`, secret-named assignments with a real value). Uses
  **gitleaks** when installed (full ruleset, redacted output) and **always** runs a self-contained
  regex fallback so the guard holds even without gitleaks installed. Bash-3.2-safe (macOS default);
  skips its own pattern files; ignores empty/placeholder values (so `.env.example` passes).
- **`.gitleaks.toml`** — extends the default ruleset; allowlists `.env.example`, `.githooks/`, and the
  documented placeholder values.
- **Wiring** — `package.json` gains a `prepare` script (`git config core.hooksPath .githooks`) so the
  hook installs on `npm install`; `core.hooksPath` also set locally now. Verified: hook blocks a
  fake JWT (exit 1) and passes clean content (exit 0).
- **`.gitignore`** — added `implementation_plan_smt.md` (QA report) so it can never be committed.

**Audit — no secrets tracked (locations only; no values printed)**

- Only `.env.example` (empty placeholders) is tracked under `.env*`; `.env.local` is **not** tracked.
- `implementation_plan_smt.md` is not on disk and not tracked; now also gitignored.
- Working tree: **0** JWT-value blobs, **0** `*.supabase.co` host strings. The word `service_role`
  appears in 4 tracked files (`README.md`, `lib/env.ts`, `lib/supabase/server.ts`, the core migration)
  — all legitimate references, no key values.
- Full git history: **0** JWT-value blobs, **0** private-key blocks.

---

## 2026-07-10 — Fix: middleware 500 on stale refresh token (breaks mutations in prod)

**What changed**

- **`lib/supabase/middleware.updateSession` now guards `supabase.auth.getUser()`** in a try/catch.
  A stale or already-rotated refresh token makes that call throw `AuthApiError`
  (`refresh_token_not_found`). Uncaught, it 500s the request; since middleware runs on every matched
  request, it silently broke **mutations** (notably creating an order) while page reads still looked
  fine. On catch we `signOut({ scope: "local" })` to clear the stale cookies and fall through — the
  auth gate then redirects to `/login` on the next hop instead of erroring the whole request.

**Why (diagnosis)**

- Reported: "can't create new orders" on the Vercel deploy. Verified end-to-end that the backend is
  healthy: production Supabase is fully seeded (1 business, 3 profiles, 12 available menu items, 6
  commission rules, 190 orders); RLS + triggers correct; reproduced the **entire** create-order flow
  under RLS as `owner` (read menu → read commission → insert `order` → insert `order_item`, all 201).
  No app-created orders exist beyond the seed (max `ORD-1190`, 2026-07-08), so submissions never
  persisted. The only server-side failure surfaced in Vercel runtime errors: `AuthApiError: Invalid
  Refresh Token: Refresh Token Not Found` at `routes=/middleware` — the unguarded `getUser()`.

**Also fixed in this pass**

- **`/settings` logo upload "Body exceeded 1 MB limit."** The app allows a 2MB logo
  (`LOGO_MAX_BYTES`, matching the `logos` bucket) but Next's default Server Action body limit is 1MB,
  so a valid logo was rejected at the transport layer before the action's own size check ran. Set
  `experimental.serverActions.bodySizeLimit = "3mb"` in `next.config.ts` (covers 2MB + multipart
  overhead).

**Follow-ups**

- Both fixes deployed to production this pass.

---

## 2026-07-10 — Repo publish prep (GitHub) + folder rename

**What changed**

- **Internal working docs excluded from the public repo.** `CLAUDE.md`, `DESIGN.md`, `LOG.md`
  (and `SPEC.pdf`, `/.claude`) added to `.gitignore` and `git rm --cached`'d — they stay on disk
  locally but are no longer tracked, so they will not be published to GitHub (per client instruction).
- **Folder rename** `samasthas-bakery-managment` → `samanthas-bakery-managment` (typo fix:
  "samasthas" → "samanthas"). The `.git` dir moves with the folder, so remotes/history are unaffected;
  the GitHub repo name and Vercel project are independent of the local folder name.
- **New GitHub repo** created under **scythe410** and the app pushed there (repo name confirmed with
  client). Only application code + config ship; the internal docs above are withheld.
- **Vercel deploy** via the Vercel MCP (env vars — Supabase URL/anon/service-role + site URL — set on
  the Vercel project; service_role stays server-only).

**Decisions / deviations**

- **No GitHub auth existed locally** (`gh` not installed, no SSH key, no token, no credential helper).
  Installed `gh` via Homebrew; repo creation/push require `gh auth login` as scythe410 (interactive —
  the client's to run). Nothing outward-facing happened before that + explicit confirmation of repo
  name / visibility / history handling.
- **Docs withheld from history, not just the latest tree** — chosen so the internal docs never appear
  in the published repo at all (see the commit-history decision recorded at push time).

**Open questions** — see tracker above (repo visibility + history handling confirmed with client at
push time; Vercel env/secret handling noted).

---

## Open questions / flags (unresolved — keep visible)

Running tracker of decisions made under ambiguity or work deferred, so they don't get buried in dated
entries. Remove an item once it's confirmed/resolved.

- **Menu nav badge semantics — assumed, needs SPEC confirmation.** DESIGN.md §4 says the Menu badge is
  "per spec," but the spec PDF couldn't be read locally (no poppler/pypdf/network). Assumed it counts
  **menu items currently unavailable** (`is_available = false`) — "sold out / needs re-enabling,"
  mirroring the Inventory low-stock badge. Implemented as one swappable field in
  `getShellBadges` (`lib/db/selectors/shell.ts`); seed has 0 unavailable so it's hidden. Confirm
  against `Samanthas_Bakery_Engineering_Spec.pdf` and adjust that one line if it means something else
  (total items, out-of-stock via recipe availability, etc.). _(App shell entry, 2026-07-08.)_
- **Placeholder route pages are thin stubs.** The not-yet-built sections
  (menu/employees) currently render only server-side gating
  + a `ComingSoon` line, so the nav isn't broken and role gating is uniform now. Each needs its real
  build in a later prompt. **Dashboard, Finance, Inventory, Orders, Reports, and Bookings are now
  built** (2026-07-09/10) and off this list. _(App shell entry, 2026-07-08.)_
- **Active/Archived tab split = one interpretation (SPEC §3.4).** The spec shows the tabs but not
  which statuses map where. We map **Active = `pending`**, **Archived = `completed` + `cancelled`**
  (open vs closed) — CLAUDE.md §4 says status drives the tabs. Centralised in `ACTIVE_STATUSES` /
  `ARCHIVED_STATUSES` (`lib/orders/order-config.ts`); change there if the client reads it differently
  (e.g. Active = pending + completed, Archived = cancelled only). Note: with seed data the Active tab
  is thin (few pending) — a seed-freshness artefact, not a design issue; new orders land as `pending`
  so they appear in Active. _(Orders entry, 2026-07-09.)_
- **Inventory "no-stock-set" state is defensive, not naturally reachable (SPEC §3.3).** The reference
  shows rows with no stock number ("stock not yet set"). Our schema made `qty_on_hand`
  `numeric not null default 0`, so there is no true "unset" — every item has a quantity. The list
  still renders a muted "Not set" when the selector reads a null/NaN qty (`qtyOnHand: number | null`),
  honouring the reference state for robustness, but with seed data it never triggers. If the client
  wants a real distinction, make `qty_on_hand` nullable in a migration. _(Inventory entry, 2026-07-09.)_
- **"Booking Revenue" = the Bookings module's committed value — one of two readings (SPEC §3.2).** The
  spec is unsure what Finance "Booking Revenue" means and ties Platform Earnings to it. We model
  **Booking Revenue = Σ(deposit + balance) of non-cancelled `booking` rows in the period** (custom-order
  pre-orders; reservations add 0) — pipeline/committed revenue, so it is deliberately NOT folded into
  realized Total Income or Est. Net Profit (which stay order-based and reconcile with the Dashboard).
  **Platform Earnings** is computed independently: per-source order commission from `commission_rule`
  (its total equals the Overview commission figure). The alternative reading — Booking Revenue = gross
  of commission-bearing/online order channels — would tie the two numerically; switch by redefining
  `bookingRevenueCents` (`_shared.ts`). Confirm with client. _(Finance entry, 2026-07-09.)_
- **"Today's Bookings" card layout inferred — reference screenshot was cut off (SPEC §3.1).** The spec
  flags this card as not fully visible. Built it as a titled section of stacked list-rows (DESIGN.md §4
  tables→mobile): primary = customer name, secondary = type · time · party size, a status pill, and a
  "Balance due" line for custom orders with an outstanding balance. Scope = bookings dated **today** in
  the tenant timezone (`getTodaysBookings`); confirm against the live reference whether it should be
  today-only or upcoming (a one-line filter change in `lib/db/queries/bookings.ts`). _(Dashboard entry,
  2026-07-09.)_
- **Seed "today" drifts as real days pass — re-run the seed to refresh the demo.** Orders/expenses are
  dated relative to when the seed ran, so on the hosted DB "today" (2026-07-09) currently shows 1
  cancelled order → Today's Sales `LKR 0.00`, and 2 bookings. That's correct/derived behaviour, but for
  a lively demo re-run `supabase db reset` (or re-apply `seed.sql`) so the forced-6-orders "today"
  lands on the current date. Not a code issue. _(Dashboard entry, 2026-07-09.)_
- **Commits land directly on `main`.** Each prompt commits to `main` (CLAUDE.md "one prompt = one
  commit"), matching the repo's history — no feature-branch-per-prompt flow. Switch to feature branches
  if the client wants PR review gates. _(Bookings entry, 2026-07-10.)_
- **`middleware` → `proxy` rename.** Next 16 warns the `middleware` file convention is deprecated in
  favour of `proxy`; left as-is (works, and CLAUDE.md §6 names `middleware.ts`). Revisit if we adopt
  the new convention. _(Carried from the SSR-clients / auth entries.)_
- **Est. net profit overlaps COGS with "Ingredients" expenses — by design, labelled "Est."** Net
  profit = net revenue − estimated COGS (from the BOM) − operating expenses, and the operating
  expenses include recorded "Ingredients" restock purchases. So ingredient cost is represented twice
  (once as modelled COGS, once as actual purchases) — the classic accrual-vs-cash gap. That is exactly
  why the figure is *estimated* and always rendered "Est." (CLAUDE.md §3). Defined once in
  `estNetProfitCents` (`lib/db/selectors/_shared.ts`); if the client wants COGS-only or expenses-only
  profit, change that one function. _(Data-layer entry, 2026-07-08.)_
- **Realized-revenue rule = `status = 'completed'`.** Revenue/commission/COGS across all three screens
  count completed orders only; pending isn't in the till yet and cancelled/refunded aren't sales. Both
  still appear in the Dashboard status breakdown. Centralised as `REALIZED_STATUS` in `_shared.ts` —
  flip there if the spec wants pending counted. _(Data-layer entry, 2026-07-08.)_
- **Week starts Monday (ISO 8601).** The "This Week" period runs Mon–Sun. One constant
  (`WEEK_STARTS_ON` in `lib/db/period.ts`) to change if the client prefers Sunday. _(Data-layer entry,
  2026-07-08.)_
- **Employees + Settings ship as BASELINE, pending client confirmation (SPEC §4.3/§4.4).** Both were
  "nav-only, confirm before building" in the spec. Built to the expected baseline scope and flagged:
  **Employees** = a read-only staff directory (roles/permissions/shift schedule); **payroll and
  attendance are out of scope** (spec asks to confirm) — surfaced as a note, no create/edit yet.
  **Settings** = business profile (+ logo upload), tax/currency, notification preferences, user
  accounts (read-only), WhatsApp API placeholder, default language. Confirm scope before hardening.
  _(Employees & Settings entry, 2026-07-10.)_
- **Currency is read-only (LKR), not an editable field (SPEC §4.4 "tax/currency config").** `lib/format`
  renders every figure as `LKR` and CLAUDE.md §4 fixes currency to LKR, so a writable currency control
  that didn't actually re-denominate money would be misleading. Settings shows currency read-only with
  a "Fixed to LKR for this build" note; the **editable** tax config is the VAT rate (stored as integer
  bps) + registration. Revisit if multi-currency is ever in scope (needs `format.ts` to become
  currency-aware). _(Settings entry, 2026-07-10.)_
- **Notification preferences record INTENT, not a delivery pipeline (SPEC §4.4).** Settings persists
  per-alert toggles to the new `business.notification_preferences` jsonb, but nothing yet consumes them
  to gate actual notification creation/delivery — the `notification` table + bell already exist
  independently. The toggle catalogue (`NOTIFICATION_KEYS` in `lib/settings/settings-config.ts`) is a
  baseline; confirm the real alert set and wire delivery later. _(Settings entry, 2026-07-10.)_
- **User Accounts is read-only; inviting/removing users is out of scope.** Creating or disabling login
  accounts needs the Supabase Admin API (service_role) + an email/invite flow, which isn't built.
  Settings lists the tenant roster (name/role/language) via a new owner/manager profile-read policy;
  role changes stay server-set only (the profile freeze trigger blocks client role writes). Flagged.
  _(Settings entry, 2026-07-10.)_
- **Business default language (`locale_default`) vs per-user `language_pref` — both exist, by design.**
  Settings › Business Profile sets the **tenant** default (`business.locale_default`); the Language card
  (P14) sets the **caller's own** `profile.language_pref`, which is what actually drives the active UI.
  `locale_default` is the fallback/new-user default, not applied to existing users' active language.
  Confirm the client wants both surfaced. _(Settings entry, 2026-07-10.)_
- **Remote DB was behind on migration 003 (storage buckets) — pushed with 004 this prompt.** `supabase
  migration list` showed the linked project had only 001/002 applied; the storage-buckets migration
  (003) had never been pushed. `supabase db push` this prompt applied **both** 003 and 004 (both
  additive/idempotent), so the `logos` bucket + tenant storage policies now exist on remote (needed for
  logo upload). Not a code issue; noted so the remote↔local migration state is understood. _(Settings
  entry, 2026-07-10.)_
- **CSP `style-src` keeps `'unsafe-inline'` — a deliberate, documented allowance, not a gap.** Scripts
  are now nonce + `strict-dynamic` (no `unsafe-inline`), but Next.js, Tailwind and Recharts all emit
  inline `style=""` attributes and `<style>` tags that no nonce can cover (there is no broadly supported
  inline-style nonce). Tightening `style-src` further would break rendering. Revisit only if a hashing
  strategy for the exact style set becomes worthwhile. _(Hardening entry, 2026-07-10.)_
- **Nonce CSP is production-only; dev stays permissive.** In development `script-src` uses
  `'unsafe-inline' 'unsafe-eval'` (+ `connect-src ws:`) because React Fast Refresh / Turbopack need
  eval and inline. The strict nonce path (`'self' 'nonce-…' 'strict-dynamic'`) is what ships in
  production and is what was verified. Intentional; noted so a dev-tools CSP check isn't mistaken for the
  prod policy. _(Hardening entry, 2026-07-10.)_
- **`menu` route is still a `ComingSoon` stub with no loading/empty/error boundaries — intentional.**
  It fetches nothing, so those states have no meaning yet; they arrive when the Menu screen is actually
  built (still on the placeholder-stub list). Every data-backed screen has all three states. _(Hardening
  entry, 2026-07-10.)_
- **`middleware`→`proxy` (Next 16) deprecation still stands.** The CSP nonce work stayed in
  `middleware.ts` (CLAUDE.md §6 names it); Next 16 warns the convention is renamed to `proxy`. Left as
  is — works today; migrate the file when adopting the new convention. _(Carried; reaffirmed 2026-07-10.)_

---

## 2026-07-10 — Security hardening and accessibility pass

Full walk of the CLAUDE.md §7 checklist plus a DESIGN.md §6 accessibility pass. No screen rebuilds —
this pass audits, tightens, and proves the existing build. All items below were **verified**, not
assumed; anything not fully closed is in the tracker above.

**§7 security checklist — walked end to end**

1. **RLS on every table, deny-by-default.** All 13 tables have `enable row level security` + explicit
   per-role policies (confirmed by the domain-access test below).
2. **Tenant isolation — negative test now runs green on the live seeded DB.** The two transaction-scoped,
   auto-rollback RLS suites (`supabase/tests/`) previously assumed a *fresh* DB: their synthetic
   "Tenant A" reused the real seed business UUID `11111111…`, so they collided on the hosted demo DB.
   Retargeted Tenant A to a collision-proof `f1111111…` (Tenant B `22222222…` and the user UUIDs don't
   collide), and scoped the one admin-visible `count(*)` assertion to the test rows so seed profiles
   don't skew it. Both suites now pass **every** row against the linked demo DB and roll back cleanly
   (a real DML rollback probe confirmed nothing persists). The isolation suite proves a user in tenant A
   **cannot read or update** tenant B's business/profile rows, and **cannot escalate role or hop tenant**
   on their own row (freeze trigger holds).
3. **`role`/`business_id`/`id` never client-settable** — the domain test proves insert **stamps**
   `business_id` from the session and update **freezes** it (name still editable).
4. **service_role never ships to the client** — grepped: it is not imported anywhere in `app/`, `lib/`,
   or `components/` (only guarded behind `getServiceRoleKey()` in `lib/env.ts`, which throws in the
   browser); and `grep` of the built `.next/static` chunks finds no `service_role` string.
5. **Sessions / route protection** — `@supabase/ssr` cookies; middleware refreshes; unauthenticated
   `/dashboard` → **307 → /login** (verified), role-gated routes → server-side `forbidden()` (403).
6. **Every mutation is Zod-validated server-side and now rejects unknown fields.** Added `.strict()` to
   `order`, `booking` (both discriminated-union members), `expense`, and `inventory` schemas (settings +
   auth already had it). Confirmed each action builds its parse object from exactly the schema's keys, so
   `.strict()` rejects smuggled fields without breaking valid input.
7. **Money recomputed server-side** — re-read `orders/actions.ts`: the client sends only menu-item ids +
   quantities; subtotal/commission/total are recomputed from stored `menu_item` prices + `commission_rule`.
8. **Storage** — live-checked: `logos` + `item-images` buckets are `public = false`; all four
   `storage.objects` policies are `TO authenticated` and tenant-path-scoped (no anon policy → anon denied
   by default; **no public write**). An anon HTTP read of a `logos` object returns **400**. Private reads
   are signed URLs.
9. **Security headers verified on a production build.** Split by nature: the static headers (HSTS,
   `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`)
   stay in `next.config.ts`; **CSP moved to `middleware.ts`** so it can carry a **per-request nonce**.
   Production now sends `script-src 'self' 'nonce-…' 'strict-dynamic'` — **no `unsafe-inline` scripts**.
   `curl` of `npm start` confirmed the CSP header on `/login` and on the `/dashboard` redirect, a **fresh
   nonce per request**, and **all 18 `<script>` tags carrying the nonce** (Next stamps it from the
   forwarded request header). `style-src 'unsafe-inline'` retained by necessity (tracker).
10. **Secrets** — `.env*` gitignored except `.env.example`; no `.env` tracked; `.env.example` documents
    all four vars with correct public/server scoping.

**Accessibility & polish (DESIGN.md §6)**

- **Keyboard focus visible everywhere.** Added a global `:focus-visible` brand-red outline (with offset)
  in `globals.css` as a baseline for every focusable element — a safety net beneath the per-component
  `focus-visible:ring` styles, so nothing (native checkboxes, links, selects) can be left with no
  visible focus. Only triggers on keyboard focus, never mouse.
- **AA contrast — measured, and two tokens fixed.** Computed WCAG ratios for every text/background pair.
  Brand red `#DA1A32` on white = **5.03:1** (passes AA for normal text — the nav/active-state red is
  fine, contrary to the DESIGN.md caution). `text-muted` 4.83:1, ember/danger 8.11:1, info 6.44:1, ink
  17.7:1 — all pass. **Failures found:** status-pill text is 11px (WCAG "normal"), and `warning`
  (3.75:1) + `success` (4.05:1) **on their own tint backgrounds** were below 4.5:1. The brand swatch is
  fixed, but DESIGN.md marks the *semantic* status colors "derived, UI-safe" and §6 requires AA — so
  darkened `--success` `#1B873F → #197C3A` and `--warning` `#B4690E → #9E5C0C` (minimal, hue-preserving).
  Both now clear AA on the tint (4.65–4.67:1) **and** on white (5.3:1). Updated in `globals.css` **and**
  `DESIGN.md §2` (the source of truth). Tailwind reads the CSS vars, so no component changed.
- **`prefers-reduced-motion`** already honored (globals.css disables the one `animate-rise` entrance).
- **Loading / empty / error states** confirmed on **every data-backed screen** (dashboard, finance,
  inventory, orders, reports, bookings, employees, settings each have `loading.tsx` + `error.tsx` +
  active-voice empty states). `menu` is a static stub — no async, so no such states (tracker).

**Docs**

- **README rewritten** from the stale "Supabase not wired up yet" into real setup + run instructions:
  prerequisites, `.env.local` table, `supabase link`/`db push`/seed (hosted) and `supabase start`/`db
  reset` (local), type generation, demo logins, the scripts table, and a Security section with the exact
  commands to run the RLS tests and to curl the production CSP header.

**Files touched:** `middleware.ts` (nonce CSP), `lib/supabase/middleware.ts` (forward request headers),
`next.config.ts` (static headers only), `app/globals.css` + `DESIGN.md` (focus ring + AA tokens),
`lib/zod/{order,booking,expense,inventory}.ts` (`.strict()`), `supabase/tests/*.sql` (collision-proof
UUIDs + seed-robust assertions), `README.md`.

**Verification:** `tsc`, `eslint`, `next build` (13 routes), and `prettier --check` all clean; both RLS
suites all-pass on the linked DB; storage + CSP + header checks as above.

**Open items** (see the tracker above — none blocking): `style-src 'unsafe-inline'` is a necessary
allowance; nonce CSP is production-only (dev stays permissive for HMR); `menu` stub has no data states
yet; the `middleware`→`proxy` rename is deferred. A full authenticated **visual** AA/focus pass in a real
browser (login sits behind a server action) is the user's to eyeball — contrast is verified numerically
and focus via the global rule + a component audit.

---

## 2026-07-10 — Employees and Settings screens

**What changed**

- **Employees built to SPEC §4.3** (`app/(app)/employees/page.tsx`), **owner/manager only**
  (`requireRole(rolesFor("employees"))` → real 403 for staff; `employee` is also owner/manager-only at
  the DB, so gating is defence-in-depth over RLS). Replaces the `ComingSoon` stub. **Read-focused
  baseline**: a staff directory rendered as stacked cards (DESIGN.md §4 tables→mobile) — name (bold),
  job title, the permission set as chips (`{all}` → one "Full access" chip; otherwise per-section
  chips), and the weekly shift schedule as per-day `WEEKDAY HH:MM-HH:MM` chips. A "Login" pill marks
  employees linked to an app account (`profile_id`). **Payroll/attendance are out of scope** (spec asks
  to confirm) — stated in a footer note; there is no create/edit yet. Streams behind a Suspense boundary
  after a shape-matched skeleton.
- **Settings built to SPEC §4.4** (`app/(app)/settings/page.tsx`), **owner only** (business/billing
  config, CLAUDE.md §5). Replaces the minimal Language-only page with six streamed sections:
  **Business Profile** (logo upload → Storage + name/timezone/tenant default language),
  **Tax & Currency** (read-only LKR + editable VAT rate in bps + registration), **Notification
  Preferences** (per-alert toggles), the **Language** card (per-user switcher, P14, kept), **User
  Accounts** (read-only tenant roster), and a **WhatsApp Business API integration placeholder**. Each
  section is a `Card`; the payload streams behind a Suspense boundary after a shape-matched skeleton.
- **New migration 004** (`supabase/migrations/20260710090000_settings_business_writes.sql`) — the
  minimum surface to make Settings real without weakening isolation:
  1. `business.notification_preferences` jsonb (Settings toggles), defaulted to sensible operational
     alerts on / digest off.
  2. An **owner-only UPDATE policy on `business`** + a `business_freeze_identity` BEFORE-UPDATE trigger
     pinning `id`/`created_at` (migrations 001/002 had left business with no client write policy). The
     owner may edit name/logo/timezone/locale/tax_config/notification_preferences of **their own tenant
     only**; `business_id`/`id` are never client-settable (CLAUDE.md §7.2/§7.3).
  3. An **owner/manager tenant-wide SELECT policy on `profile`** (additive to "read own"), so User
     Accounts can list the roster. Staff keeps self-only visibility. The `private.current_*()` helpers
     are SECURITY DEFINER with a pinned `search_path`, so referencing them from a policy on `profile`
     doesn't recurse (same pattern the expense/employee policies use).
- **Server-side mutations (CLAUDE.md §7)** — `app/(app)/settings/actions.ts` + `lib/zod/settings.ts`:
  `updateBusinessProfile`, `uploadLogo`, `updateTaxConfig`, `updateNotificationPreferences`. Every
  action **re-asserts the owner role** (`requireRole`), Zod-validates (`.strict()` rejects unknown
  fields), and targets the caller's own tenant (`.eq("id", business_id)`) — `business_id` is never taken
  from the client. The VAT rate arrives as a percent and is stored as **integer basis points** (no float
  money, §3). Logo upload validates mime/size, writes to `logos/<business_id>/logo-<epoch>.<ext>` (the
  private per-tenant bucket, §7.8), stores the **object PATH** on `business.logo_url`, best-effort
  removes the superseded object, and reads are served via a **signed URL** minted in the selector.
- **Data layer**: `lib/db/queries/employees.ts` (`listEmployees`) + `lib/db/selectors/employees.ts`
  (`getEmployeeList` → typed items, parsed shift/permissions); `lib/db/queries/settings.ts`
  (`listTenantProfiles`, `signLogoUrl`) + `lib/db/selectors/settings.ts` (`getSettings` → business view,
  parsed tax/notification config, signed logo URL, user roster). `lib/employees/employee-config.ts` and
  `lib/settings/settings-config.ts` hold the shift/permission and notification/tax shapes as ONE
  client-safe source shared by the components, selectors, and Zod schemas. `lib/supabase/types.ts`
  updated with the new `notification_preferences` column.
- **States (DESIGN.md §6)**: `EmployeesSkeleton` / `SettingsSkeleton` (Suspense fallback + route
  `loading.tsx`), active-voice empty states (empty directory), and `error.tsx` boundaries for both.
- **i18n**: full `employees.*` and `settings.*` keys (directory chrome, weekday + permission labels,
  every Settings section, form/state/error copy) added to `en.json` **and** `si.json` at exact parity
  (380 = 380). Permission keys are config values, so they go through i18n; employee names / job titles /
  user names are business data, shown as entered — not translated (CLAUDE.md §3).

**Decisions / deviations**

- **Currency read-only, VAT editable; notification prefs record intent; user accounts read-only; tenant
  default vs per-user language; payroll/attendance out of scope** — all flagged in the tracker above.
- **Both screens are baseline builds** (spec §4 "confirm before building"); shaped to the expected scope
  with real RLS-safe reads/writes so they can harden without a rewrite, and every deferral is labelled
  in-UI and in the tracker.
- **Verified end-to-end on the hosted DB** (RLS-scoped anon path, after `supabase db push` applied
  migrations 003 + 004). Signed in as the seed **owner**: reads `business` incl. the new
  `notification_preferences`; a real `business` UPDATE (name/tax/notifications) succeeds and round-trips
  cleanly; the **id is frozen** (an id-change attempt leaves the row's id untouched); reads **all 3**
  tenant profiles and **5** employees; **uploads a logo** into its tenant folder and mints a **signed
  URL**. Signed in as **staff**: `business` UPDATE affects **0 rows** (owner-only policy), sees **only
  its own** profile and **0** employees, and a **cross-tenant logo upload is blocked** by storage RLS
  ("new row violates row-level security policy"). All test writes were restored/removed. `tsc`, eslint,
  and `next build` all clean (13 routes).

**Open questions** — see the tracker above (both screens are baseline pending client confirmation;
payroll/attendance, notification delivery, user provisioning, multi-currency all deferred).

---

## 2026-07-10 — Bookings screen with reservations and custom pre-orders

**What changed**

- **Bookings built to SPEC §4.2 / CLAUDE.md §4** (`app/(app)/bookings/page.tsx`), accessible to all
  roles (RLS: `booking` is tenant-access for owner/manager/staff, CLAUDE.md §5). Replaces the
  `ComingSoon` stub. The list streams behind a Suspense boundary after a shape-matched skeleton
  (DESIGN.md §6). **BOTH booking types are in scope** — reservations *and* custom-order bakery
  pre-orders — with list + create for each.
- **Type segment (the on-screen toggle)** (`components/bookings/bookings-browser.tsx`): a two-option
  segmented control — **Reservations / Custom Orders** — with a live per-type count; switching it
  swaps the list and re-targets the "+ New" action at that type. Plus **search** ("Search by customer
  or phone", matches `customer_name`/`customer_phone`), a **status filter**, and a **date filter**.
  All filtering is client-side over the fetched set.
- **Stacked list-rows** (DESIGN.md §4 tables→mobile), adapting per type: primary = customer name (or
  "Guest"); reservations show `date · time · Party of N`; custom orders show the item description, a
  `Pickup: date · time` line, and a **Balance due** figure when outstanding; each row carries a
  status pill (pending→warning, confirmed→info, completed→success, cancelled→danger) + a source pill.
  Customer names / item descriptions are business data, shown as entered — not translated (CLAUDE.md §3).
- **"+ New Booking" flow** (`components/bookings/new-booking-form.tsx`): one form that adapts to the
  active segment. **Reservation** captures date (required) / time / party size; **Custom order**
  captures an item description, pickup date (required) / time, and the order **total + deposit**.
  Both capture optional customer name/phone, a source, and a status.
- **Server-side mutation (CLAUDE.md §7)** — `app/(app)/bookings/actions.ts` + `lib/zod/booking.ts`:
  input is a **Zod discriminated union on `type`**, so each kind validates only its own fields and
  unknown fields are rejected. `business_id` is set from the authenticated profile (never the client);
  money arrives in rupees and is converted to integer cents server-side (`toCents`); the custom-order
  **balance is COMPUTED server-side** as `max(0, total − deposit)` — the client never sends a balance.
  A custom order's `date` is set to its **pickup day** (so it appears on the dashboard on the day it
  matters) and `pickup_at` is stored as a correct `timestamptz` via the new
  `zonedWallTimeToUtcIso` helper (`lib/db/period.ts`), which resolves a local date/time in the tenant
  timezone. The action revalidates `/bookings` **and** `/dashboard`.
- **Today's Bookings feed** — new bookings dated today (reservation date / custom-order pickup date)
  flow into the existing Dashboard "Today's Bookings" section (`getTodaysBookings`) with no change to
  that selector, satisfying the requirement that today's bookings feed the dashboard.
- **Data layer**: `lib/db/queries/bookings.ts` gains `listAllBookings` (RLS-scoped, newest date
  first); `lib/db/selectors/bookings.ts` gains `getBookingsList` → typed `BookingListItem[]` (both
  types, money in cents, `HH:MM` time). `lib/bookings/booking-config.ts` holds the enums as ONE
  client-safe source shared by the segment, the form, and the Zod schema (the source list is reused
  from `order-config` — bookings share the `order_source` enum).
- **States (DESIGN.md §6)**: shared `BookingsSkeleton` (Suspense fallback + route `loading.tsx`);
  per-type active-voice empty states + a filtered no-match state; `error.tsx` boundary.
- **i18n**: full `bookings.*` keys (segment, type, status, search, filters, new-booking form, states)
  added to `en.json` **and** `si.json` at exact parity (296 = 296). Status/source labels reuse the
  existing `bookings.status.*`-style and `source.*` keys; Sinhala strings reuse the proven vocabulary
  already in the file (e.g. `අද වෙන්කිරීම්`, `විශේෂ ඇණවුම`). No hardcoded UI strings.

**Decisions / deviations**

- **Custom-order money model = total + deposit → balance.** The form captures the order total and the
  deposit paid; the server stores `deposit_cents` and `balance_cents = max(0, total − deposit)`. So
  Finance "Booking Revenue" (`Σ(deposit + balance)`) equals the order total by construction, and the
  dashboard's "Balance due" is real. Total itself isn't a column (schema has deposit/balance only), so
  it's derived at entry, not stored.
- **Custom order `date` = pickup day.** The booking table has one `date` and a separate `pickup_at`.
  Setting `date` to the pickup day makes a custom order surface on the dashboard on the day the bakery
  must act; `pickup_at` keeps the precise timestamp. Reservations use `date`/`time` directly.
- **List ordering newest-date-first** (undated last), mirroring the Orders convention. A forward
  "upcoming first" schedule view is a one-line query change if the client prefers it.
- **Verified end-to-end on the hosted DB** (signed in as the seed owner via the RLS-scoped anon path):
  the list read returns **10 bookings (5 reservation + 5 custom_order)**; a **real reservation insert**
  stored date/time/party correctly; a **real custom-order insert** with total 8,000 / deposit 3,000
  stored `deposit=300000`, `balance=500000` (**booking revenue 800000 = total**) and `pickup_at`
  `10:00 Colombo → 04:30Z` (correct offset); both rows appeared in the tenant's today query (the
  dashboard feed); then both test rows were deleted to keep the demo clean. `tsc`, eslint, and
  `next build` all clean (13 routes).

**Open questions** — none new. (Bookings off the placeholder-stub list; the Dashboard "Today's
Bookings" layout tracker item stays, as it concerns that card's today-only vs upcoming scope.)

---

## 2026-07-09 — Barcode scan-to-add for inventory

**What changed**

- **"Scan to Add" built to SPEC §5.1** (`components/inventory/scan-to-add.tsx`), replacing the stubbed
  entry point next to "+ Add Item". Opens the device camera via getUserMedia (through `@zxing/browser`'s
  `decodeFromConstraints`, `facingMode: environment`) and decodes EAN-13/8, UPC-A/E, QR, and Code-128
  (formats pinned via `DecodeHintType.POSSIBLE_FORMATS` for faster reads). Installed `@zxing/browser`
  (0.2.1) + `@zxing/library` (0.23.0).
- **Product lookup runs server-side** (`lib/inventory/product-lookup.ts` + `lookupBarcode` action in
  `app/(app)/inventory/actions.ts`). On a read, the code is validated to a GTIN (`barcodeLookupSchema`,
  8–14 digits) and looked up against **Open Food Facts** (free, no key); a hit prefills Name + a mapped
  Category and defaults **kind = merchandise** (a scanned barcode is a packaged retail good). The fetch
  is server-side so the browser only ever talks to our own origin — the CSP `connect-src` stays tight,
  no third-party origin. 5s timeout + every miss/error resolves to `found:false`.
- **Falls back to a blank form on no match** — the add-item form still opens, with the scanned barcode
  retained and kind defaulted to merchandise, so the user just fills Name/details and saves.
- **Barcode stored for re-scans.** `AddItemForm` gained an optional `prefill` (name/category/kind/
  barcode) and a hidden `barcode` field; `addInventoryItem` + `addInventoryItemSchema` now accept and
  persist it (empty → NULL, so the partial unique index isn't tripped by barcode-less items). The
  selector surfaces `barcode`, and the browser builds a `code → name` index; a re-scan of a stocked
  product is recognised up front ("Already in inventory: …") instead of hitting the DB. A duplicate that
  slips to insert is caught by the unique-violation (23505) → `inventory.scan.duplicate`.
- **Manual entry fallback** for unreadable codes (and the primary path when the camera is unavailable):
  a numeric text field + "Look up" that flows through the same handler (re-scan check → lookup → form).
- **Camera-permission handled gracefully** — `NotAllowedError` → "Camera access was blocked",
  `NotFoundError`/`OverconstrainedError` → "No camera found", missing `mediaDevices` (insecure context)
  → an https-required message, else a generic fault; each keeps manual entry available and offers "Try
  camera again". The stream is always torn down (`controls.stop()`) on read, error, close, or unmount —
  nothing keeps the camera live in the background.
- **i18n**: full `inventory.scan.*` set (title, hint, states, errors, manual entry, duplicate) +
  `inventory.add.barcode`, in en + si (parity 249 = 249). Removed the placeholder `inventory.scan.soon`.

**Decisions / deviations**

- **Open Food Facts as the "public product API".** Free, no key, strong coverage of packaged food/
  beverage retail goods — the merchandise a bakery would scan. Swappable in one server module if a
  broader catalogue is wanted; the client never sees which API is used.
- **Kind defaults to merchandise on the scan path.** A scanned GTIN is a packaged retail product, so
  scan-originated adds default kind = merchandise (SPEC "set the merchandise flag appropriately"); the
  user can still change it before saving. The plain "+ Add Item" path keeps its ingredient-first default.
- **No CSP/next.config change needed.** `Permissions-Policy: camera=(self)` already allows the camera,
  and the product call is server-side so `connect-src` needs no third-party origin.
- **Full camera flow needs a real device + https to exercise.** Verified statically (build, lint, tsc),
  that zxing bundles into a client chunk, the server boots, and `/inventory` gates unauthed users to
  login. The live camera read + a real product hit are the user's to confirm on a phone.

**Open questions** — none new. (Category mapping from OFF tags is heuristic; refine
`categoryFromTags` if the client wants tighter buckets.)

---

## 2026-07-09 — Sinhala language mode

**What changed**

- **i18n audit — full coverage confirmed (CLAUDE.md §3).** Swept every built screen (Dashboard,
  Finance, Inventory, Orders, Reports, shell, login, forbidden) for hardcoded UI strings: none found —
  the only string literals in the tree are classNames, code comments, and dynamic content (customer /
  menu names, `order_no`, example email placeholder). Wrote a locale audit (run ad hoc) that confirms:
  **en.json ↔ si.json at exact key parity (228 = 228)**, every `t("…")` key referenced in code exists,
  and every dynamic `t(\`prefix.${enum}\`)` prefix (`source.*`, `orders.payment/paymentStatus/status/
  tabs/empty.*`, `dashboard.bookings.status.*`, `inventory.kind/category.*`, `reports.type.*`) covers
  all its enum values in both locales. So the extraction was already complete from the per-screen
  prompts; this pass verifies it rather than retrofitting (which §3 forbids).
- **Language switcher in Settings (SPEC §5.2)** — replaced the Settings `ComingSoon` stub with a real
  Language section (`components/settings/language-setting.tsx`, `app/(app)/settings/page.tsx`).
  A `radiogroup` of the two languages, each shown by its **own endonym** (English / සිංහල, so it reads
  in its native script whichever UI language is active — the standard picker convention); the active
  option carries a red-tint fill + check. Persists via the existing `setLanguage` server action →
  `profile.language_pref` (per user; RLS + freeze trigger keep it to the caller's own row), which
  `revalidatePath("/", "layout")`s so `<html lang>`, the Sinhala font, and the i18n instance all follow
  with no reload. The header `LanguageToggle` stays as the quick per-device shortcut (and the only
  switch reachable by staff/manager, since Settings is owner-only, CLAUDE.md §5).
- **Endonyms live in i18n** (`settings.language.en/si`, identical in both locales) rather than hardcoded
  in the component — keeps to "no hardcoded UI strings" while still displaying each language natively.
  Removed the now-unused `settings.comingSoon` key from both locales (parity preserved).
- **Noto Sans Sinhala verified end-to-end.** Already wired (`lib/fonts.ts` → `--font-noto-sinhala`,
  Tailwind `font-sinhala`, applied to `<body>` when `lang="si"` by the root layout for the initial paint
  and mirrored client-side by `I18nProvider` on later switches). Confirmed against the built output: the
  CSS bundle carries `.font-sinhala{font-family:var(--font-noto-sinhala),…}` and next/font's
  `--font-noto-sinhala:"Noto Sans Sinhala"`, the Sinhala woff2 subset is preloaded, and si.json's glyphs
  ship in the client chunk. The Settings option label and header toggle both render in the Sinhala face.
- **Numerals/dates/currency stay Arabic (CLAUDE.md §3 i18n note).** `formatLKR`/`formatAmount` are
  locale-independent (fixed en-US grouping), and dates render as `YYYY-MM-DD` / `HH:mm` — unchanged by
  the language, in both en and si. Dynamic content (customer/menu names) is passed through untranslated.

**Decisions / deviations**

- **Switcher kept in BOTH header and Settings.** SPEC §5.2 wants it in Settings; the header toggle
  predates this and is the only path for staff/manager (Settings is owner-gated) and the fastest
  per-device switch for everyone — so both stay, calling the one `setLanguage` action. Not a conflict.
- **Settings is otherwise still minimal.** Only the Language section ships now (this prompt's scope);
  business/billing config lands in a later Settings prompt. The owner-only gate is unchanged.
- **Runtime check was static + served-bundle, not an authed screenshot.** The Sinhala screens sit behind
  auth and I can't log in non-interactively, so full-flow visual verification is the user's to do
  (login → Settings → සිංහල, or the header toggle). The dev/prod server was left running at
  `localhost:3000` for that.

**Open questions** — none new.

---

## 2026-07-09 — Reports screen with daily sales and exports

**What changed**

- **Reports › Daily Sales built to SPEC §3.5** (`app/(app)/reports/page.tsx`), owner/manager only
  (`rolesFor("reports")` → real 403 for staff). Replaces the `ComingSoon` stub. The report body streams
  behind a Suspense boundary keyed on `type + date` after a shape-matched skeleton.
- **Controls in the URL** (`components/reports/report-controls.tsx`): a **report-type dropdown**
  (Daily Sales selected) and a **date picker** (defaults to the tenant's current day). Both live in the
  URL so each selection is server-rendered and shareable. The report type is an extensible enum
  (`lib/reports/report-params.ts`: `REPORT_TYPES`, `toReportType`) — adding a type is additive (list +
  i18n `reports.type.*`), matching CLAUDE.md §5 "extend, don't hardcode".
- **Reconciled figures from the P8 selector.** `getDailyReport` (`lib/db/selectors/reports.ts`) reuses
  the one `aggregateOrders` from `selectors/_shared.ts`, so the four stat cards (Revenue / Commission /
  Net Revenue / Orders) and the By Source / By Payment breakdowns are the **realized** totals — the same
  numbers the same period yields on Dashboard and Finance. A Daily Sales report is one calendar day,
  expressed as a single-day custom period (`singleDayPeriod`) resolved in the tenant timezone.
- **By Source / By Payment breakdowns** (`components/reports/report-breakdowns.tsx`): "pill — N orders —
  LKR total" rows; each list sums back to the headline Revenue. Payment method `unknown` renders a
  "No method" label defensively.
- **Detail table** (`components/reports/report-detail.tsx`): a real wide table (the DESIGN.md §4
  sanctioned exception — "Reports detail export preview"), horizontal-scroll wrapped, columns Time /
  Source / Customer / Items / Total / Payment (method + payment-status pill) / Status. Lists **every**
  order in the day with its status — unlike the headline figures (completed only) — so pending/cancelled
  rows are visible and labelled; a `reports.note` line states the headline counts completed orders only.
  Rows come chronological (query already orders ascending); new `zonedClockTime` (`lib/db/period.ts`)
  renders the local `HH:mm` in the tenant timezone.
- **Exports**: **Export CSV** builds the file client-side from the already-derived rows (translated
  labels, `toMajor(…).toFixed(2)` amounts, RFC-4180 quoting, UTF-8 BOM) and downloads
  `daily-sales-<date>.csv`; **Print / PDF** hands off to `window.print()` (Save as PDF there).
- **Selector shape**: `DailyReport` gains a `rows: ReportRow[]` field (id, order no, local time, source,
  customer, item count, total, payment method/status, status); totals/breakdowns unchanged.
- **States (DESIGN.md §6)**: `ReportsSkeleton` (Suspense fallback + route `loading.tsx`); active-voice
  empty states for breakdowns and the table; `error.tsx` boundary.
- **i18n**: full `reports.*` keys (type, date, stats, breakdown, detail, actions, note, error) added to
  `en.json` + `si.json`. No hardcoded UI strings; enum values reuse existing `source.*`,
  `orders.payment.*`, `orders.paymentStatus.*`, `orders.status.*`.

**Decisions / deviations**

- **Detail table lists ALL orders in the day, headline figures count completed only.** The table carries
  a Status column, so a pending/cancelled row is meaningful and shown; the report states plainly (via
  `reports.note`) that Revenue/Commission/Net Revenue/Orders count completed orders — so the table's
  total column deliberately need not sum to the headline Revenue. Honest over tidy (CLAUDE.md §3).
- **CSV/Print are client-side (no API route).** For a demo, generating the CSV from the derived rows in
  the browser and using the native print dialog is sufficient and adds no server surface. Revisit if a
  server-rendered PDF or a signed export URL is wanted later.
- **Report type is a single-item enum today** (`daily_sales`). Kept the list/label/switch keyed off it so
  other report types (e.g. a date-range sales summary, tax report) slot in without a rewrite.

**Open questions** — none new. (Reports off the placeholder-stub list; §3.5 Daily Sales as specified.)

---

## 2026-07-09 — Orders screen with server-side total recomputation

**What changed**

- **Orders built to SPEC §3.4** (`app/(app)/orders/page.tsx`), accessible to all roles (RLS: `"order"`
  is CRUD for owner/manager/staff, CLAUDE.md §5). Replaces the `ComingSoon` stub. The list + new-order
  menu stream behind a Suspense boundary after a shape-matched skeleton.
- **Active/Archived tabs** (`components/orders/orders-browser.tsx`): client-state tabs driven by
  `order.status` via the shared `tabForStatus` map (Active = pending, Archived = completed/cancelled —
  flagged in the tracker), each with a live count. **Search** ("Search by ID or customer") matches
  `order_no` or `customer_name`. **Filter row**: All Sources / All Statuses / All Payments selects + a
  date filter (compares the order's tenant-timezone local date). All filtering is client-side over the
  fetched set.
- **Stacked list-rows** (DESIGN.md §4 tables→mobile): line 1 = order no (bold) + total (bold,
  `tabular-nums`); line 2 = source pill · customer (or "—") · item count (Σ line qty); line 3 =
  payment-method pill + payment-status pill (tone-coded) + order-status pill (pending→warning,
  completed→success, cancelled→danger). No wide table.
- **"+ New Order" flow** (`components/orders/new-order-form.tsx`): pick source, optional customer,
  payment method/status, and menu lines via +/− quantity steppers. Shows an on-screen **estimated**
  total (explicitly labelled) from the same stored prices, for UX only.
- **Server-side recomputation (CLAUDE.md §3/§7.7)** — `app/(app)/orders/actions.ts`: the client sends
  **only** menu item ids + quantities (a JSON `items` field — no price, no total, no commission). The
  action re-reads the authoritative `menu_item` rows, snapshots `name`/`unit_price_cents` onto each
  line, and recomputes `subtotal = Σ storedPrice × qty`, `commission = subtotal × commission_rule.rate_bps`
  (via the shared `orderCommissionCents`), and `total = subtotal`. `business_id` is set from the
  authenticated profile; `order_no` is minted as `ORD-<max existing suffix + 1>`; a new order lands as
  `pending`. Zod (`lib/zod/order.ts`) rejects unknown fields; any submitted id that isn't one of the
  tenant's menu items is refused; if the line insert fails the order row is rolled back (deleted).
- **Data layer**: `lib/db/queries/orders.ts` gains `listAllOrdersWithItems` + `listOrderNos`;
  `lib/db/queries/menu.ts` (new) has `listAvailableMenuItems` + `listMenuItemsByIds`;
  `lib/db/selectors/orders.ts` (new) exposes `getOrdersList` (typed rows, item counts, tenant-tz date
  key, tab) + `getNewOrderMenu`. `lib/orders/order-config.ts` holds the enums + the tab split as ONE
  client-safe source shared by the filters, the form, and the Zod schema.
- **States (DESIGN.md §6)**: shared `OrdersSkeleton` (Suspense fallback + route `loading.tsx`);
  per-tab active-voice empty states + a filtered no-match state; `error.tsx` boundary.
- **i18n**: full `orders.*` keys (tabs, search, filters, status/payment/paymentStatus labels, the
  new-order form, plural item counts, states) added to `en.json` **and** `si.json`. Order numbers,
  customer names, and menu item names/prices are business data, shown as entered/stored (CLAUDE.md §3).

**Decisions / deviations**

- **`total = subtotal`** (commission tracked separately, not added to the bill) — matches the seed
  model and the revenue selectors, so a new order reconciles with Finance/Reports by construction.
- **Active/Archived split** and its seed-thinness are flagged in the tracker above.
- **Verified end-to-end on the hosted DB** (signed in as the seed owner via the RLS-scoped client):
  the list read returns orders + embedded line items; the recompute path gives subtotal `148000`,
  uber_eats `2500` bps → commission `37000`, total `148000`; a **real insert** through the same path
  stamped `business_id`, minted `ORD-1191` (max+1), and stored subtotal/commission/total **exactly
  matching the recomputation** — then the test order was deleted to keep the demo clean. `tsc`,
  eslint, and `next build` all clean (13 routes).

---

## 2026-07-09 — Inventory screen

**What changed**

- **Inventory built to SPEC §3.3** (`app/(app)/inventory/page.tsx`), accessible to all roles
  (`requireProfile`; RLS makes `inventory_item` CRUD for owner/manager/staff, CLAUDE.md §5). Replaces
  the `ComingSoon` stub. List streams behind a Suspense boundary after a shape-matched skeleton.
- **"Low Stock" pill** (`components/inventory/inventory-browser.tsx`): a toggle chip with the live
  low-stock count (same rule as the nav badge — `qty_on_hand <= low_stock_threshold`, computed in the
  selector); tapping filters the list to low-stock items only (`aria-pressed`), disabled at 0. The
  badge reads the true tenant count, so it reconciles with the Inventory nav badge by construction.
- **Search + category filter**: full-width "Search ingredients…" box (matches items by name) and a
  category dropdown ("All categories" + the categories actually present, in enum order). Filtering is
  client-side over the fetched rows.
- **Stacked list-rows** (DESIGN.md §4 tables→mobile): primary line = item name (bold, shown as
  entered — not translated, CLAUDE.md §3) with a red "Low" pill when low-stock; secondary line =
  category (muted) + a kind pill (`Ingredient` neutral / `Merchandise` info); trailing = qty + unit,
  right-aligned, `tabular-nums`. No wide table.
- **"+ Add Item"** — a working form (`add-item-form.tsx` + `app/(app)/inventory/actions.ts` +
  `lib/zod/inventory.ts`), matching the Finance Add-Expense precedent so the demo screen is live, not
  a dead button. Zod-validated server-side, `business_id` set from the authenticated profile (never
  the client), `category`/`kind` constrained to the Postgres enums, unit cost entered in rupees →
  integer cents via `toCents`, revalidates `/inventory` (row + low-stock counts + nav badge refresh).
- **"Scan to Add" stubbed for P15**: the entry point renders (ScanLine icon + label) and, on tap,
  reveals a one-line "arrives in a later step" note — the barcode/getUserMedia/ZXing flow (SPEC §5.1)
  lands in a later prompt.
- **Data layer**: `lib/db/queries/inventory.ts` (`listInventoryItems`, raw RLS-scoped read) +
  `lib/db/selectors/inventory.ts` (`getInventoryList` → items + `lowStockCount` + present
  `categories`, React-`cache()`d, low-stock tallied in JS since it's a column-to-column compare).
  `lib/inventory-config.ts` holds the enum sets as ONE client-safe source shared by the filter, the
  add form, and the Zod schema.
- **States (DESIGN.md §6)**: shared `InventorySkeleton` (Suspense fallback + route `loading.tsx`);
  active-voice empty state ("No inventory items yet. Add your first item.") and a filtered no-match
  state; `error.tsx` boundary.
- **i18n**: full `inventory.*` keys (pill, search, filters, category/kind labels, add form, scan stub,
  states) added to `en.json` **and** `si.json`. Category/kind values go through i18n keys keyed on the
  enum value, so nothing user-facing is hardcoded; item names stay as entered.

**Decisions / deviations**

- **"+ Add Item" is functional, not a stub.** The prompt lists it as a primary action; following the
  Finance Add-Expense precedent, it's a real Zod-validated mutation so the screen behaves like a live
  system (CLAUDE.md §1). Form covers name / kind / category / qty / unit / unit-cost / low-stock
  threshold; barcode is left to the P15 scan flow.
- **Category filter shows only present categories** (enum-ordered), not all five, to avoid dead
  options — same approach as the Finance expenses filter. Change to `INVENTORY_CATEGORIES` for a fixed
  five-option list if the client prefers.
- **Search placeholder uses the "…" glyph** (`Search ingredients…`) to match the app's typographic
  convention (e.g. `Signing in…`); the spec wrote `...`. Cosmetic; flag if the client wants literal dots.
- **No-stock-set state** flagged in the tracker above (schema made qty non-null).
- **Verified end-to-end on the hosted DB** (signed in as the seed owner via `@supabase/ssr`'s anon
  path): the RLS-scoped read returns **22 items, 11 low-stock** (matches the nav badge + seed), all
  five categories present, kind/qty/unit correct. `tsc`, eslint, and `next build` all clean (13 routes).

---

## 2026-07-09 — Finance screen (Overview / Expenses / Platform Earnings)

**What changed**

- **Finance built to SPEC §3.2** (`app/(app)/finance/page.tsx`), owner/manager only via
  `requireRole(rolesFor("finance"))`. Three tabs + the period selector live in the **URL**
  (`?tab=…&period=…&from=&to=`), so every selection is server-rendered from the derived selectors and
  is shareable; the active tab streams behind a Suspense boundary keyed on tab+period (re-suspends to a
  skeleton on change).
- **Period selector** (`components/finance/period-selector.tsx`): Today / This Week / This Month /
  Custom (from+to dates), default This Month. Shared across all three tabs so Expenses and Platform
  Earnings reconcile with Overview for the same window.
- **Overview** (`overview-tab.tsx`): 2-col stat grid — Total Income (green), Booking Revenue (ink),
  Total Expenses (ember), Net Profit (sign-aware, labelled "Est."), Total Orders (full-width 5th card)
  — plus **Revenue by Day** bar chart (Recharts, Y-axis in thousands "18k", bars in brand red, custom
  tooltip, empty state). Installed `recharts` (was missing from deps though CLAUDE.md §2 names it).
- **Expenses** (`expenses-tab.tsx` + `expenses-ledger.tsx`): reconciling Total Expenses headline (same
  figure as Overview — both from the same rows), **+ Add Expense** action, category + search filters
  (client-side over the fetched period), entries as stacked list-rows. New `getExpenseLedger` selector.
- **Add-expense action** (`app/(app)/finance/actions.ts` + `lib/zod/expense.ts`): Zod-validated,
  re-checks the Finance role, sets `business_id`/`created_by` server-side (never from client), converts
  rupees → integer cents via `toCents`, revalidates `/finance`. Categories in `lib/expense-categories.ts`
  (free-text column, so these are suggestions).
- **Platform Earnings** (`platform-earnings-tab.tsx` + table): per-source commission from
  `commission_rule` — source pill, orders, gross, rate %, commission; total = Overview commission.
  Re-asserts the Finance role gate; `commission_rule`/`expense` RLS also blocks staff at the DB.
- **Selectors extended** (`lib/db/selectors/finance.ts`): `getFinanceOverview` now returns
  totalIncome / bookingRevenue / totalExpenses / netProfit / totalOrders / commission / revenueByDay;
  added `getPlatformEarnings`. New `bookingRevenueCents` rule + `listBookingsInRange` query. All money
  flows through the shared `aggregateOrders`, so Finance reconciles with Dashboard/Reports by
  construction.
- **States (DESIGN.md §6)**: shared tab skeleton (Suspense fallback) + route `loading.tsx`; empty
  states for the ledger, filtered ledger, chart, and platform table; `error.tsx` boundary. Reusable
  `StatCard` primitive added (`components/ui/stat-card.tsx`).
- **i18n**: full `finance.*` + `source.*` keys added to `en.json` **and** `si.json`. Source/category
  values shown as data where they're proper nouns (WhatsApp, PickMe, Uber Eats kept Latin in Sinhala).

**Decisions / deviations**

- Net Profit uses the shared `estNetProfitCents` (income − commission − COGS − expenses), so it equals
  the Dashboard's Est. Net Profit for the same period; labelled "Est." on the card (CLAUDE.md §3), a
  small deviation from the spec's bare "Net Profit" wording, in favour of honesty.
- "Booking Revenue" interpretation is flagged in the tracker above (spec was unsure).
- Verified end-to-end on the hosted DB (owner, This Month): Income `LKR 62,040`, Booking Revenue
  `LKR 99,000`, Expenses `LKR 540,000`, Commission `LKR 5,164.40`, and **commission total ==
  Σ per-source** (Platform Earnings reconciles with Overview). Confirmed **staff RLS returns 0 rows**
  for both `expense` and `commission_rule` — Platform Earnings is protected at the database, not just
  the UI. `tsc`, eslint, `next build` all clean.

---

## 2026-07-09 — Dashboard screen

**What changed**

- **Dashboard built to SPEC §3.1** (`app/(app)/dashboard/page.tsx`), top to bottom: Today's Sales
  hero card, Orders Today 2×2 grid, Est. Net Profit card with an Income/Expenses breakdown, and a
  Today's Bookings section. Replaces the `ComingSoon` stub.
- **Signature money treatment (DESIGN.md §1/§2)**: hero figures in Archivo `display-xl`, tabular
  numerals. Today's Sales is a neutral gross total → inked in `--text`. Est. Net Profit is sign-aware →
  `--success` when positive, `--danger` when zero/negative.
- **Orders Today 2×2** (`components/dashboard/orders-today-grid.tsx`): four tone-coded blocks (Total
  neutral, Completed success, Pending warning, Cancelled danger), each an icon chip (lucide) + count +
  label, fed by the selector's pre-tallied `StatusCounts`.
- **Est. Net Profit breakdown**: added a purpose-built `profit: { incomeCents, expensesCents }` to
  `getDashboardSummary` so the card does **no math** (CLAUDE.md §2). Framed as the owner reads it —
  Income = the day's sales (equals the Today's Sales figure), Expenses = platform commission + est.
  COGS + operating expenses. By construction `income − expenses === estNetProfitCents`, so the two
  lines always reconcile with the hero figure.
- **Today's Bookings** (`lib/db/queries/bookings.ts` + `lib/db/selectors/bookings.ts` +
  `components/dashboard/bookings-list.tsx`): new query/selector for bookings dated today in the tenant
  timezone; stacked list-rows with status pill, party size (reservations) and Balance-due
  (custom orders). Customer names / item descriptions shown as entered — dynamic content, not
  translated (CLAUDE.md §3).
- **States (DESIGN.md §6)**: shape-matched loading skeletons stream per section via two Suspense
  boundaries in the page (`dashboard-skeletons.tsx`) + a matching route `loading.tsx`; active-voice
  empty state for a day with no bookings; an `error.tsx` boundary ("Couldn't load your dashboard" +
  Retry). One restrained entrance animation (`animate-rise`, ~150ms, reduced-motion-safe) added to
  `globals.css`.
- **Reusable primitives**: `components/ui/card.tsx` (the card surface) and `components/ui/status-pill.tsx`
  (tinted, label-always-present pill) extracted for reuse by later screens.
- **i18n**: all chrome added to `en.json` **and** `si.json` (Today's Sales, Orders Today + status
  labels, Est. Net Profit, Income/Expenses, bookings section + type/status labels, empty + error
  copy). Card leaf components are Client Components using `useTranslation`, so labels re-translate
  instantly on the language toggle; data is fetched in server wrappers and passed as props.

**Decisions / deviations**

- Server/client split: async **server** components (`dashboard-stats.tsx`, `todays-bookings.tsx`) do
  the fetching; **client** leaf cards format money (`formatLKR` — render-time only) and translate. No
  money math in components.
- Verified end-to-end on the hosted DB: signed in as the seed owner, confirmed RLS returns tenant rows
  and the Colombo "today" window resolves to 2026-07-09 (1 cancelled order, `LKR 0.00` completed sales,
  2 bookings). `tsc`, eslint, and `next build` all clean; route gates unauthenticated → `/login` (307).
- Did **not** drive a full authenticated browser render (login is a server action; heavy to script) —
  build type-checks/compiles every boundary and the client patterns match existing working components.

**Open questions** — see the tracker above (Today's Bookings layout inferred from a cut-off screenshot;
seed "today" freshness).

---

## 2026-07-08 — Server-side data access layer + derived selectors

**What changed**

- **Shared period utility** (`lib/db/period.ts`): resolves Today / This Week / This Month / custom in
  the **tenant's timezone** (Asia/Colombo for the seed), not the server's — a 00:30 Colombo sale reads
  as today for the shop even though it's yesterday in UTC. Pure and `now`-injectable. Exposes the
  window two ways because the schema stores time two ways: `startUtc`/`endUtc` (half-open instant range
  for `timestamptz` columns like `order.created_at`) and `startDate`/`endDate` (inclusive local
  `YYYY-MM-DD` for `date` columns like `expense.date`), plus `days[]` to zero-fill charts. Timezone
  math via `Intl.DateTimeFormat` (no date lib in the stack); validated Colombo midnight maps to the
  correct −05:30 UTC instant. Two-pass offset resolution so it stays correct across DST for other
  zones.
- **Raw queries** (`lib/db/queries/`): `orders.ts` (`listOrdersWithItems` — orders + embedded snapshot
  line items in one PostgREST call), `expenses.ts` (`listExpenses`, filtered by local date bounds),
  `pricing.ts` (`listCommissionRules` + `listRecipeCostLines`, the BOM joined to ingredient unit
  costs). All `server-only`, all through the **RLS-scoped** anon client — results are always the
  caller's tenant, no `business_id` filter to spoof. No derivation in queries.
- **Single source of truth for money** (`lib/db/selectors/_shared.ts`): every revenue/commission/COGS
  figure across Dashboard, Finance, and Reports flows through one `aggregateOrders()`. Commission is
  **recomputed** from stored subtotals × `commission_rule.rate_bps` (CLAUDE.md §7.7), never read from
  `order.commission_cents`. COGS rounds once per menu item after summing fractional BOM contributions,
  so per-order COGS is exact integer `unitCogs × qty`. Given the same rows the aggregate is
  deterministic, which is what makes the three screens reconcile by construction, not by luck.
- **Three consumer selectors**: `getDashboardSummary` (sales, 2×2 status breakdown, income, expenses,
  COGS, commission, est. net profit — default Today), `getFinanceOverview` (revenue/expenses/commission
  /COGS/net-profit stat cards + zero-filled revenue-by-day — default This Month), `getDailyReport`
  (revenue/commission/net/orders + by-source + by-payment — default Today). All money integer cents;
  nothing formatted (that stays in `format.ts`). Each is React-`cache()`d and resolves its period in
  the tenant timezone via `resolveTenantPeriod` (`selectors/context.ts`, reusing the cached
  `getBusiness`).

**Decisions / deviations**

- No new i18n keys: this layer returns numbers and enum keys, not UI chrome — strings land when the
  screens consuming these selectors are built.
- Reconciliation guarantees (same period): Dashboard `salesCents` = Finance `revenueCents` = Reports
  `revenueCents`; the shared `commissionCents` is identical everywhere; Reports `netRevenueCents` =
  revenue − commission; Finance `netProfitCents` = Dashboard `estNetProfitCents` (same helper); Reports
  `bySource`/`byPayment` rows sum back to the headline totals.
- Couldn't run a live end-to-end reconciliation against seed data this prompt — Docker/Supabase local
  wasn't running. Typecheck, lint, and the timezone-boundary math are verified; reconciliation is
  guaranteed structurally (one shared aggregate). Worth a live check once `supabase start` is up.

---

## 2026-07-08 — App shell: role-aware nav, notifications, i18n scaffold

**What changed**

- **Sticky header** (`components/app/app-header.tsx`, now a Client Component per DESIGN.md §4): screen
  title (left, derived from the active route via the shared nav registry so it stays in lockstep with
  the nav and goes through i18n) + right action cluster: language switch, **notification bell with the
  live unread count**, sign-out. Dropped the earlier logo/greeting header in favour of the spec's
  title + bell.
- **Persistent bottom nav** (`components/nav/bottom-nav.tsx`): 9 items in DESIGN.md §4 order
  (Dashboard, Finance, Inventory, Menu, Orders, Bookings, Employees, Reports, Settings), fixed +
  phone-width + safe-area aware (`pb-[env(safe-area-inset-bottom)]`), 44px+ tap targets, horizontal
  scroll fallback rather than dropping items. Active item in brand red (`aria-current="page"`); others
  muted. **Role-filtered** via `canAccess` (staff sees only its 5 permitted items). **Live badges** on
  Inventory (low-stock) and Menu, rendered only when > 0 (`components/ui/count-badge.tsx`).
- **Live counts** (`lib/db/selectors/shell.ts`, `getShellBadges`, server-only + RLS-scoped, React
  `cache()`): unread notifications (bell), low-stock inventory (`qty_on_hand <= low_stock_threshold`,
  computed in JS since PostgREST can't filter column-to-column), unavailable menu items. Fetched once
  in the layout and passed to both header and nav.
- **i18n**: language switch (`components/nav/language-toggle.tsx` + `setLanguage` server action in
  `app/(app)/actions.ts`) persists to `profile.language_pref` (Zod-validated, `lib/zod/profile.ts`),
  revalidates the layout, and swaps the Sinhala font. `i18n/client.tsx` now also syncs `<html lang>` +
  the `font-sinhala` body class on client-side language change so the swap is immediate. All shell
  chrome (nav labels, header, bell, toggle, placeholders) added as keys to `en.json` **and** `si.json`
  — nothing hardcoded.
- **Access matrix extracted** to `lib/access.ts` (client-safe: `SECTION_ROLES`, `rolesFor`,
  `canAccess`, `Section`, `AppRole`). `lib/auth.ts` re-exports it, so the server gate (`requireRole`)
  and the client nav filter share **one** source of truth (CLAUDE.md §5: RLS *and* UI gating).
- **Route pages**: added minimal, server-gated placeholder pages for all 9 sections so the nav is
  navigable and gating is uniform — open sections call `requireProfile`, gated sections
  (finance/reports/employees → owner+manager, settings → owner) call `requireRole(rolesFor(...))`.
  Screen bodies use a reactive `ComingSoon` (`components/app/coming-soon.tsx`); the title now lives in
  the header, so the per-page `<h1>` was removed. `app/(app)/layout.tsx` renders header + nav and pads
  `<main>` to clear the fixed nav.
- **Deps**: added `lucide-react` (nav/header icons).

**Decision — Menu badge semantics (SPEC-ambiguous, flagged)**

DESIGN.md §4 says the Menu badge is "per spec," but no PDF tooling was available locally to read
`Samanthas_Bakery_Engineering_Spec.pdf` (no poppler/pypdf/network). Chose **count of menu items
currently marked unavailable (`is_available = false`)** — the "sold out / needs re-enabling" count,
mirroring Inventory's low-stock "needs attention" badge and using the existing `menu_item_available_idx`.
Implemented as a swappable field in `getShellBadges`. Seed currently has 0 unavailable, so the badge is
hidden. **Open question:** confirm this against SPEC.pdf; adjust the one selector line if it means
something else (e.g. total items, or out-of-stock via recipe availability).

**Verification (live dev server + real `@supabase/ssr` sessions)**

- **Role-filtered nav**: staff `/dashboard` shows exactly its 5 permitted items and **0** of the 4
  gated ones; owner shows all 9. Staff `/finance`, `/reports`, `/employees`, `/settings` → **403**;
  owner → 200.
- **Badges**: owner nav shows Inventory **11** (matches live low-stock), Menu badge hidden (0
  unavailable), header bell **4 unread** (matches live). Active item carries `aria-current="page"`.
- **i18n / font swap**: staff (`language_pref = si` in seed) renders `html lang="si"`, `font-sinhala`
  on `<body>`, and Sinhala nav/header/bell strings — proving per-profile language end-to-end. Owner
  renders English.
- **Language write path** (what the toggle triggers): owner en → si → en round-trips with no error;
  RLS `profile: update own` + the freeze trigger allow `language_pref` while still blocking role
  changes.
- `tsc --noEmit` clean, `eslint` clean, `next build` succeeds (13 routes).

**Deviations / notes**

- Header became a Client Component (needs `usePathname` + client i18n for the reactive title/toggle);
  gating stays server-side in the layout/pages.
- Placeholder pages for the 7 not-yet-built sections are intentionally thin — they exist so the nav
  isn't broken and server gating is consistent now; each gets its real build in a later prompt.

**Open questions** — Menu badge definition (above), pending SPEC confirmation.

---

## 2026-07-08 — Auth flow with server-side role gating

**What changed**

- **Login screen** (`app/(auth)/login/page.tsx` + `components/auth/login-form.tsx`) per DESIGN.md §5/§4:
  centered `<Logo>` (monogram fallback) above a card, email/password form, full-width primary CTA
  (Bonfire Red → Ember on hover), brand focus rings, active-voice error states. Already-authenticated
  visitors are redirected to `/dashboard`.
- **Sign-in** is a server action (`app/(auth)/login/actions.ts`) so `@supabase/ssr` writes session
  cookies server-side. Input validated with Zod (`lib/zod/auth.ts`, `.strict()` rejects unknown
  fields — §7.6). Supabase 400 → `login.errorInvalid`; anything else → `login.errorGeneric` (no
  detail leaked). Form drives it via `useActionState`.
- **Sign-out** server action (`app/(app)/actions.ts`): `auth.signOut()` + redirect to `/login`.
  Wired to `components/app/sign-out-button.tsx` in the shell header.
- **(app) layout** (`app/(app)/layout.tsx`): `requireProfile()` runs the server-side session check and
  redirects unauthenticated users to `/login` (§7.5). Loads profile + business and passes a
  serializable subset into the client `AppProvider` (`components/app/app-provider.tsx` →
  `useAppContext()`), the "server-provided context available to the shell." Minimal sticky header
  (`components/app/app-header.tsx`, logo + greeting + sign-out); bottom nav / bell are later steps.
- **`lib/auth.ts`** — server-only auth surface: `getUser` / `getProfile` / `getBusiness` (React
  `cache()`-deduped per request), `getCurrentLanguage`, `requireProfile` (→ `/login`), and
  **`requireRole(allowed)`** which calls Next's `forbidden()` (real HTTP **403**) for disallowed
  roles. `SECTION_ROLES` encodes the CLAUDE.md §5 access matrix once (owner/manager/staff → sections)
  and is the single source of truth for both server gating and future UI nav gating (`rolesFor`,
  `canAccess`). `app/(app)/settings/page.tsx` calls `requireRole(rolesFor("settings"))` (owner-only)
  as the canonical gate demonstration; `app/forbidden.tsx` renders the 403 UI.
- **i18n foundation** (see decision below): `i18n/config.ts`, `i18n/server.ts` (`getT` for RSC),
  `i18n/client.tsx` (`I18nProvider` via react-i18next, mounted once in the root layout with the
  server-resolved language), and `i18n/locales/{en,si}.json`. Root layout is now async: it resolves
  the language, sets `<html lang>` + the Sinhala body font, and wraps the tree in the provider. All
  new chrome (login, shell, dashboard/settings placeholders, 403) goes through keys in both locales —
  nothing hardcoded.
- **`next.config.ts`**: enabled `experimental.authInterrupts` (required for `forbidden()` +
  `app/forbidden.tsx`); added the Supabase origin to CSP `connect-src` (https + `wss:` realtime) and
  `img-src` (Storage), replacing the earlier TODO.
- **Deps**: added `i18next`, `react-i18next` (`zod` already present).
- **Placeholder pages**: minimal `dashboard` (all roles) and `settings` (owner-only) so the shell has
  real landing/redirect targets; `app/page.tsx` now redirects `/` → `/dashboard`. Removed `.gitkeep`
  from directories that gained real files.

**Decision — stood up the i18n foundation here (deviation from a strictly auth-only scope)**

CLAUDE.md §3 forbids hardcoded UI strings and says i18n keys are added "as you build — never
retrofitted." This is the first UI, so building the login screen with literals and retrofitting later
would violate that rule. I therefore established a minimal but real i18next layer (server + client,
en + si) as part of this prompt rather than flag-and-stall. Kept tight: one `common` namespace, no
language-switcher UI yet (that's a later step); language is driven by `profile.language_pref`, default
`en`.

**Security (CLAUDE.md §7.5)**

- Sessions are `@supabase/ssr` cookies; middleware refreshes; protected routes redirect
  unauthenticated users server-side; role-gated routes return a server-side **403**, not a hidden nav
  item. `lib/auth.ts` is `server-only`. Reads go through the RLS-scoped anon client, so gating is
  defence-in-depth over RLS, never a substitute.

**Verification (live, against the linked project + local dev server)**

- Seed accounts on the linked project sign in via the Auth API; roles present in `app_metadata`
  (`owner`/`manager`/`staff`); wrong password → HTTP 400 (→ `login.errorInvalid`).
- Unauthenticated: `/login` → 200; `/dashboard` and `/settings` → 307 `/login`; `/` → `/dashboard`.
- **Role gate, end-to-end with real `@supabase/ssr` cookies**: staff → `/dashboard` **200**,
  `/settings` **403**; owner → both **200**.
- CSP header now includes `https://…supabase.co` + `wss://…supabase.co` in `connect-src` and the
  Storage origin in `img-src`.
- `tsc --noEmit` clean, `eslint` clean, `next build` succeeds (`authInterrupts` experiment active).

**Deviations / notes**

- Next 16 still warns `middleware` is deprecated in favour of `proxy` (unchanged from last entry);
  left as a future chore.
- `forbidden()` is behind `experimental.authInterrupts` in Next 16.2 — enabled deliberately; it's the
  idiomatic way to emit a real 403 from a Server Component.

**Open questions** — none.

---

## 2026-07-08 — Supabase SSR clients + money/format/env libs

**What changed**

- **Dependencies**: added `@supabase/ssr@^0.12`, `@supabase/supabase-js@^2.110`, and `server-only`
  to `package.json`. (`zod@4` was already present.) Uses `@supabase/ssr` — the deprecated
  `auth-helpers` is **not** used anywhere (CLAUDE.md §2).
- **`lib/supabase/client.ts`** — browser client via `createBrowserClient<Database>`, keyed on the
  public URL + anon key only. For Client Components.
- **`lib/supabase/server.ts`** — server client via `createServerClient<Database>`, cookies read from
  `next/headers`. Marked `import "server-only"` so importing it into a Client Component is a build
  error. Still the anon key + RLS (not a service_role/admin client) — tenant isolation stays in the DB.
  Created per-request (never cached); `setAll` swallows the read-only-cookie throw from Server
  Components since middleware writes the refreshed cookies.
- **`lib/supabase/middleware.ts`** + root **`middleware.ts`** — session refresh on every matched
  request. `updateSession` mirrors refreshed cookies onto both request and response, and calls
  `supabase.auth.getUser()` immediately after client creation (per Supabase SSR guidance) to trigger
  token refresh. Matcher excludes `_next/static`, `_next/image`, favicon, and image files.
  **Scope note:** refresh only — route protection / role gating is deferred to the auth step.
- **`lib/supabase/types.ts`** — generated `Database` types (already present from the schema prompt),
  wired through all three clients via `createXClient<Database>(...)`.
- **`lib/env.ts`** — boot-time env validation. Two tiers: `env` holds only `NEXT_PUBLIC_*` values
  (URL, anon key, site URL) read as static property accesses so Next inlines them; missing/blank
  fails fast. `getServiceRoleKey()` is the **only** accessor for `SUPABASE_SERVICE_ROLE_KEY` — a
  function (never a top-level const) that **throws if `typeof window !== "undefined"`**, so the
  service_role key cannot reach the browser (CLAUDE.md §7.4). Zero-dependency hand-rolled check so it
  loads in every runtime.
- **`lib/money.ts`** — integer-cents arithmetic (CLAUDE.md §3). `assertCents` (safe-integer guard),
  `toCents` (only float→money boundary, rounds once, half-away-from-zero), `toMajor`, `add`,
  `subtract`, `multiply` (integer qty only), `applyRateBps` (commission), `sum`. Floats never touch
  money downstream; `add`/etc. reject non-integer inputs.
- **`lib/format.ts`** — render-time only. `formatLKR(cents)` → `LKR 12,345.00`; `formatAmount(cents)`
  → `12,345.00` (bare, for `tabular-nums` columns). Fixed `en-US` grouping so it's always standard
  thousands, never lakh/crore. Consumes `toMajor` from money.ts; no math or storage of strings.

**Security (CLAUDE.md §7.4/§7.5)**

- Client bundle can only ever see `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  `SUPABASE_SERVICE_ROLE_KEY` is unprefixed (Next never inlines it) **and** guarded behind a runtime
  window-check in `getServiceRoleKey()`. No client module imports it.
- `server.ts` is `server-only`; sessions are cookie-based via `@supabase/ssr`; middleware refreshes.

**Verification**

- `npx tsc --noEmit` → clean. `npm run lint` → clean. `npm run build` → success.
- Runtime sanity check of the money/format helpers: `toCents(12.34) === 1234` (no float drift),
  `multiply(1500,3) === 4500`, `applyRateBps(10000,1500) === 1500` (15%), `sum([100,200,300]) === 600`,
  `formatLKR(1234500) === "LKR 12,345.00"`, `formatAmount(50) === "0.50"`, `add(1.5, 2)` throws
  `RangeError`.

**Deviations / notes**

- Build emits a Next.js 16 warning that the `middleware` file convention is deprecated in favour of
  `proxy`. Kept `middleware.ts` because CLAUDE.md §6 directory layout specifies it and it still works;
  a rename to `proxy.ts` can be a later chore if we adopt the new convention.
- `env.ts` intentionally hand-rolls validation instead of using Zod so it stays dependency-free and
  loadable in edge/browser/server runtimes.

**Open questions** — none.

---

## 2026-07-08 — Storage buckets with per-tenant policies (migration 003)

**What changed**

- `supabase/migrations/20260708082130_storage_buckets_per_tenant.sql` — creates two **private**
  buckets (`logos`, `item-images`) and four `storage.objects` policies (`select/insert/update/delete`)
  `TO authenticated`, each gated on `bucket_id in ('logos','item-images')` **and**
  `(storage.foldername(name))[1] = private.current_business_id()::text`. Reuses the existing
  `private.current_business_id()` accessor (migration 001) so storage isolation resolves tenant the
  same way the domain tables do.

**Storage path convention** (single source of truth — reference from `lib/db` when wiring uploads)

- Object path (the object *name* within a bucket) is **always** `<business_id>/<filename>`. The first
  segment is the `business_id`; that is exactly what the RLS policies gate on.
  - `logos`       → `<business_id>/logo-<epoch>.<ext>`
  - `item-images` → `<business_id>/<menu_item_id>.<ext>` (or `<uuid>.<ext>` for inventory/other)
- DB columns (`business.logo_url`, `menu_item.image_url`, …) store the **object path**, never a
  signed URL. Signed URLs expire; storing one would rot. Generate a fresh signed URL server-side at
  read time via `createSignedUrl(path, ttl)`.

**Decisions / rationale (CLAUDE.md §7.8)**

- **Both buckets private** (`public = false`). No anon policy exists on `storage.objects`, so
  anon/unauthenticated read *and* write are denied by default → **no public write**, and private
  reads must go through signed URLs.
- **All four verbs** provided because Supabase storage **upsert requires INSERT + SELECT + UPDATE**;
  DELETE lets a tenant remove its own objects. Every verb carries the same bucket+prefix predicate,
  so cross-tenant read/write/delete is impossible.
- `file_size_limit` / `allowed_mime_types` set per bucket (logos 2 MiB incl. svg; item-images 5 MiB,
  raster only) — defence in depth, not a security boundary.
- Buckets inserted with `on conflict (id) do update` so re-applying against a linked project that
  already has the buckets is safe.

**Types / DB regen** — not needed. No generated `lib/supabase/types.ts` exists yet (only `.gitkeep`,
no `gen:types` script), and storage adds **no `public`-schema tables**, so nothing to regenerate.

**Deviations** — buckets are defined in the **migration** (`insert into storage.buckets`) rather than
declaratively in `config.toml [storage.buckets]`, so the same SQL graduates to production unchanged
and there is one source of truth (avoids config/SQL double-creation).

**Verification — PENDING (blocked on Docker)**

- `supabase start` / local `db reset` could not run: Docker daemon is not running. SQL was authored
  against the confirmed Supabase folder-prefix policy pattern (`storage.foldername(name)[1]`) and the
  migration-001 accessor, but has **not** yet been executed.
- To verify once Docker is up (or against the linked remote): `supabase db reset`, then as the
  seeded **owner** upload to `<owner_business_id>/…` (allowed) vs another business_id prefix
  (**denied**); confirm anon read/write is denied; confirm a `createSignedUrl` read round-trips.
  Note the result here when run.

**Open question** — should logo writes be **owner-only** (Settings is owner-scoped per §5)? Current
policy allows any authenticated tenant member to write both buckets. Left tenant-wide for now to
match the prompt ("authenticated users … within their own business"); tighten to a role check if the
client wants logo management gated to owners.

---

## 2026-07-08 — Internally consistent seed data

**What changed**

- `supabase/seed.sql` — one tenant ("Samantha's Bakery") + full demo dataset. Loaded after
  migrations on `supabase db reset` (`config.toml [db.seed]` → `./seed.sql`). Idempotent: header
  deletes the business (cascades all domain rows + profiles) and the three demo auth users before
  re-inserting, so it can be applied repeatedly.
- **Dates are relative to `now()`/`current_date`, not pinned**, so Dashboard "today", Finance
  "this month", and upcoming bookings are always populated whenever the seed is loaded.
- Contents: 1 business; 3 auth users (+identities) whose profiles are **auto-created by the
  `on_auth_user_created` trigger** from `raw_app_meta_data` (business_id/role) — seed does not insert
  profiles directly, so it exercises the real signup path; 8 customers; 22 inventory items
  (ingredient + merchandise, all 5 categories); 12 menu items; 50 recipe_lines (BOM → COGS);
  6 commission_rules; **190 orders** over 42 days with 462 order_items (price/name snapshots);
  15 expenses across 6 categories; 10 bookings (5 reservations + 5 custom-order cakes); 5 employees
  (3 linked to profiles, 2 non-login); 7 notifications (4 unread).

**Dev credentials (DEV ONLY — hosted demo project; not production secrets)**

| Role | Email | Password |
|---|---|---|
| owner | `owner@samanthas.demo` | `Owner#12345` |
| manager | `manager@samanthas.demo` | `Manager#12345` |
| staff | `staff@samanthas.demo` | `Staff#12345` |

**Consistency model (so Dashboard / Finance / Reports reconcile from the same rows)**

- `order.subtotal_cents` = Σ(`order_item.qty × unit_price_cents`); `total_cents` = `subtotal_cents`
  (no tax/tips/delivery modelled — kept flat and exact). `commission_cents` =
  `round(subtotal × rate_bps / 10000)` using the matching `commission_rule`. Commission is the
  aggregator's cut → **Net Revenue = total − commission** downstream; own channels
  (dine_in/walk_in/whatsapp/online) are 0 bps, pickme_food 18%, uber_eats 25%.
- Orders generated in a PL/pgSQL block so the three money columns are exact by construction, not
  hand-typed. Today (`d=0`) is forced to 6 orders = 3 completed / 2 pending / 1 cancelled to fill the
  Dashboard 2×2 grid; history is settled (completed, ~1/23 cancelled).
- Low-stock (`qty_on_hand <= low_stock_threshold`) is true for **exactly 11** items to match the
  reference badge count.

**Verification (hand-run against the linked remote via `psql`; all pass)**

- Profiles: 3, roles owner/manager/staff correct; staff `language_pref = si`.
- Low-stock count: **11** ✓.
- Order reconciliation — all three checks return **0** mismatches: `subtotal ≠ Σitems`,
  `total ≠ subtotal`, `commission ≠ round(subtotal × rate)`.
- Totals by status: completed 179 (LKR 329,180.00), pending 2 (LKR 3,560.00), cancelled 9
  (LKR 17,660.00) → 190 orders.
- **Today is non-trivial**: 6 orders (3/2/1 completed/pending/cancelled); today's sales (completed) =
  **LKR 5,030.00**. Summing today's completed order rows equals what the Dashboard "Today's Sales"
  selector will compute (same rows, same rule).
- Platform earnings (Finance), completed only: pickme_food LKR 11,176.20, uber_eats LKR 18,412.50.
- Bookings: both types present, mixed statuses. Notifications: 4 unread (bell badge).

**Decisions & deviations**

- **Applied to the linked remote with `psql` (from `libpq`), not `supabase db reset`.** No local
  Docker (carried over from 001/002 → cloud-only), and `db reset --linked` would drop the whole
  schema; a plain `psql -f seed.sql` inserts into the (empty) tables without touching the migrated
  schema, and let me run the verification queries above. The file is still the standard
  `config.toml`-wired seed and will run verbatim on `supabase db reset` locally later.
- `total_cents = subtotal_cents` (commission tracked separately, not added on top): the aggregator
  commission is deducted from the merchant's take, not charged to the customer, so gross = subtotal
  and net = subtotal − commission. Revenue selectors filter `status='completed'`; cancelled/pending
  rows exist for realistic Orders tabs but must be excluded from revenue.

**Open questions**

- Whether Dashboard/Reports "revenue" should be gross `total` or net `total − commission` is a
  selector-layer decision; the seed stores both so either reading reconciles. Flag when selectors land.

---

## 2026-07-08 — Domain schema + per-role RLS (migration 002)

**What changed**

- Migration 002 `20260707183409_domain_schema.sql` — the full §4 domain model.
- Enums (§5): `order_source`, `payment_method`, `payment_status`, `order_status`,
  `booking_type`, `booking_status`, `inventory_kind`, `inventory_category`.
- Tables (all money `*_cents` int; all carry `business_id`, `created_at`, `updated_at`):
  `customer`, `inventory_item`, `menu_item`, `recipe_line`, `"order"`, `order_item`,
  `expense`, `booking`, `employee`, `commission_rule`, `notification`.
  - `order_item` snapshots `name_snapshot` + `unit_price_cents`.
  - `menu_item.category`, `expense.category`, `employee.role`, `notification.type` are **text**
    (§5 doesn't enumerate them; avoided inventing enum values).
- Indexes: `business_id` on every table; `customer(business_id, phone)`; **partial unique**
  `inventory_item(business_id, barcode) where barcode is not null` (barcode unique per business, nulls
  allowed); `"order"(business_id, created_at desc)`, `(business_id, status)`, unique `(business_id,
  order_no)`; covering indexes for every FK; `commission_rule(business_id, source)` unique.
- Integrity: child tables use **composite FKs** `(parent_id, business_id) → parent(id, business_id)`
  (needs the `unique(id, business_id)` I added to customer/menu_item/inventory_item/"order"), so a row
  can't point at another tenant's parent. `ON DELETE SET NULL (col)` nulls only the ref column, never
  `business_id`.
- Enforcement (§7.3): generic `BEFORE INSERT private.set_business_id_from_session()` stamps
  `business_id` from the session (overrides client value; preserved for service-role/seed);
  `BEFORE UPDATE private.touch_and_freeze()` bumps `updated_at` and freezes `id`+`business_id`. New
  helper `private.current_app_role()` (SECURITY DEFINER, private schema) drives role gating.

**Per-table RLS (all `TO authenticated`, tenant-scoped by `private.current_business_id()`)**

| Table | owner | manager | staff |
|---|---|---|---|
| customer | CRUD | CRUD | CRUD |
| inventory_item | CRUD | CRUD | CRUD |
| menu_item | CRUD | CRUD | CRUD |
| recipe_line | CRUD | CRUD | CRUD |
| "order" | CRUD | CRUD | CRUD |
| order_item | CRUD | CRUD | CRUD |
| booking | CRUD | CRUD | CRUD |
| notification | CRUD | CRUD | CRUD |
| **expense** | CRUD | CRUD | **none** |
| **commission_rule** | CRUD | CRUD | **none** |
| **employee** | CRUD | CRUD | **none** |

Each table has exactly one `FOR ALL` policy per access tier (governs SELECT/INSERT/UPDATE/DELETE);
deny-by-default means anyone outside the tenant — and staff on the three restricted tables — gets
nothing. Chose one clear `FOR ALL` policy per tier over 44 hand-written per-command policies to
minimise copy-paste security holes (the prompt asked for **per-role** policies).

**Decisions & numbers**

- `order` kept singular per the §4 model → reserved word, double-quoted as `public."order"` in raw SQL
  (the JS client's `.from('order')` handles quoting itself).
- `supabase db advisors --linked`: **0 WARN/ERROR**. First pass flagged one unindexed FK
  (`expense.created_by`) → added `expense_created_by_idx`; re-run has 0 unindexed FKs. Remaining INFOs
  are all `unused_index` (expected — no data/queries yet; indexes are intentional).
- Verified on the linked remote:
  - Structural: all 11 tables RLS-on with a policy; migrations 001+002 synced local↔remote.
  - Behavioral `supabase/tests/rls_domain_access.sql` (tx + rollback, 3 roles × 2 tenants):
    **14/14 pass** — staff blocked from expense/commission_rule/employee, manager/owner allowed,
    tenant isolation holds, insert stamps `business_id` from session, update freezes it.

**Deviation from plan**

- None. (Cloud-not-local carried over from the 001 entry.)

**Open questions**

- **`order` table name — pending client/team call.** Kept singular per the §4 model, which makes it a
  SQL reserved word requiring double-quoting (`public."order"`) in all raw SQL. Offered alternative:
  rename to `orders` (drops the quoting friction, breaks the otherwise-singular naming convention).
  No blocker either way; flag it here so we decide before selectors/queries harden around the name.
- Order totals/commission are recomputed server-side later (§7.7) — schema just stores the `*_cents`
  columns now.

---

## 2026-07-07 — Supabase init + tenancy & auth schema (migration 001)

**What changed**

- `supabase init` → `supabase/config.toml` (+ CLI `.gitignore`). Created migration 001
  `supabase/migrations/20260707180956_core_tenancy_and_auth.sql`.
- **Migration 001** — core tenancy + auth:
  - Enums `public.app_role` (owner|manager|staff), `public.app_language` (en|si).
  - Tables `public.business` (tenant root) and `public.profile` (PK = `auth.users.id`, 1:1),
    `profile_business_id_idx`, `updated_at` triggers.
  - Signup trigger `on_auth_user_created` → `private.handle_new_user()` creates the profile.
    Authorization fields (`business_id`, `role`) are read from **`raw_app_meta_data`**
    (service-role-only) — never from user-editable `raw_user_meta_data`. Name/language come from
    user_metadata. `business_id` may be null and **fails closed** under RLS until an admin assigns it.
  - `private.profile_freeze_privileged_columns()` BEFORE UPDATE freezes `id/business_id/role`, so a
    client can only ever edit `name/language_pref` (CLAUDE.md §7.3).
  - Accessors `private.current_profile()` / `private.current_business_id()` (SECURITY DEFINER, pinned
    `search_path=''`, self-scoped by `auth.uid()`), used by RLS without recursion.
  - **RLS enabled + deny-by-default** on both tables. Policies: business SELECT own tenant; profile
    SELECT/UPDATE own row. No INSERT/DELETE policies → those are denied.

**Decisions & numbers**

- **Cloud, not local** (per user override — see deviation). CLI 2.90.0.
- **All privileged/helper functions live in a `private` schema** (not exposed by PostgREST) instead of
  `public`. This was driven by `supabase db advisors`: the first pass (functions in `public`) raised 4
  WARNs — `handle_new_user` callable by anon/authenticated via `/rest/v1/rpc`, and the accessors
  exposed as RPC. Moving them to `private` + granting EXECUTE on the two accessors only to
  `authenticated` cleared all WARNs. Re-run advisors: **0 warnings**, only 1 INFO (`unused_index` on
  `profile_business_id_idx` — expected with no data yet; index is needed for tenant queries, kept).
- Verified against the linked remote: structural checks (RLS on, policies, function security/schema,
  enums, triggers) + a behavioral **tenant-isolation negative test**
  (`supabase/tests/rls_tenant_isolation.sql`, tx-scoped + rollback): all 8 assertions pass — trigger
  creates profiles, cross-tenant read/write blocked, role-escalation/tenant-hop frozen.

**Deviation from plan**

- CLAUDE.md §2 specifies **local dev via `supabase start`**. User directed cloud instead (Docker also
  wasn't running). So: no local stack; created a hosted project and `supabase db push` to it. The
  migration is environment-agnostic and still runs locally via `supabase start` later if desired.
- Free-tier project cap hit on the first account → user switched to a second Supabase account for the
  new project.

**Env / secrets location (NOT the values)**

- Linked hosted project ref: `fixyqbmdqvyiukdliijo` (org `dj's-org`, ap-southeast-1). Dashboard link
  is derivable from the ref.
- Project URL + anon key + service_role key + DB password are in **`.env.local`** (gitignored;
  confirmed via `git check-ignore`). The CLI stores the project ref under `supabase/.temp/`
  (gitignored). **No secrets are committed** — verified `config.toml` is clean.
- `.env.example` already documents the required var names.

**Open questions**

- Key style: project has both legacy `anon`/`service_role` JWTs and new `sb_publishable_*`/`sb_secret_*`
  keys. Used the legacy names to match CLAUDE.md §7.4 (`NEXT_PUBLIC_SUPABASE_ANON_KEY`); revisit if we
  adopt the newer publishable/secret keys when wiring `@supabase/ssr`.

---

## 2026-07-07 — Scaffold: Next.js + Tailwind + tokens

**What changed**

- Initialized the repo: Next.js 16 (App Router) + React 19 + TypeScript, Tailwind v4,
  ESLint (flat config) + Prettier. No Supabase yet (deliberately deferred).
- **Design tokens**: all DESIGN.md §2 variables defined in `app/globals.css` (`:root`);
  `tailwind.config.ts` maps them to semantic utilities (`bg-surface`, `text-muted`, `text-brand`,
  `bg-brand`, `ring-brand`, `rounded`, `rounded-pill`, `shadow-card`) plus the DESIGN.md §3 type
  scale. Config is referenced from CSS via `@config` (Tailwind v4 is CSS-first).
- **Fonts** via `next/font` (`lib/fonts.ts`): Archivo (display), Inter (body), Noto Sans Sinhala
  (loaded + variable exposed, **not applied** — switches on later with `lang="si"`).
- **Security headers** in `next.config.ts`: CSP, HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy`.
- `.env.example` (documents `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`, server-only
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`), `.gitignore` (`.env*`, `node_modules`,
  `.next`, Supabase local artifacts), `.prettierignore`.
- Directory skeleton per CLAUDE.md §6 (`app/(auth)`, `app/(app)/<screens>`, `app/api`,
  `components/{ui,nav}`, `lib/{supabase,db/{queries,selectors},zod}`, `i18n/locales`,
  `supabase/migrations`) with `.gitkeep`s. Minimal home page + `public/logo-placeholder.svg`
  monogram. README.

**Decisions & numbers**

- Versions (current at build): Next `16.2.x`, React `19.2.x`, Tailwind `4.3.x`, ESLint `9.x`,
  TypeScript `6.x`. Not pinned from memory — resolved via `npm install @latest` per CLAUDE.md §2.
- Tailwind v4 is CSS-first. Kept an explicit `tailwind.config.ts` (semantic token → CSS-var map)
  as requested and wired it via `@config`, rather than inlining `@theme`, so the token map stays in
  one readable place.
- Lint script is `eslint .` (flat config). `next lint` was removed in Next 16; `eslint-config-next`
  now ships flat config arrays (`core-web-vitals`, `typescript`).
- Foreground text utility is `text-ink` (maps to `--text`); app background is `bg-bg`. Kept
  DESIGN.md's literal token names for muted/faint/brand/surface.

**Deviations from plan**

- None substantive. The prompt describes a classic v3-style "tailwind.config with tokens"; delivered
  the same intent on the current Tailwind v4 (CSS-first) — documented above.

**CSP allowances (revisit)**

- `script-src 'unsafe-inline'` is a temporary allowance for Next's inline bootstrap/hydration
  scripts. **TODO:** replace with a per-request nonce once middleware exists (arrives with Supabase).
  `'unsafe-eval'` and `ws:` are dev-only (Turbopack/Fast Refresh). When Supabase lands, add its URL
  + realtime `wss://` to `connect-src` and its Storage origin to `img-src`.

**Open questions**

- None blocking.
