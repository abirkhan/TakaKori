# SPA + PWA Feasibility Study

**Status:** Proposal. Nothing here is accepted. No ADR is written until a decision
is made — this document exists to inform one.

**Question asked:** can TakaKori become a single-page application with prebuilt
UI, asynchronous client-side data loading, offline support, PWA install
prompting, and behaviour indistinguishable from an installed Android/iOS app?

**Answer:** Yes to the SPA, and yes to PWA installability, and yes to offline
_reads_. Offline _writes_ are possible but are the only part of this that carries
genuine financial-integrity risk, and "works exactly like a native app" is
reachable on Android and only approximately reachable on iOS.

The refactor is unusually cheap for this codebase — roughly a week of work
against a 9.6k-line tree, with no schema change. The reason is structural, not
lucky: this project already keeps every piece of business logic either in pure
TypeScript or in the database. There is almost nothing in a server that a
browser could not do itself. The costs are concentrated in three places, none
of which are the SPA itself: the seven duplicated profile reads, the
Server Action layer, and the Playwright suite.

Read §2 before deciding. It is the part that changes what "offline" means.

---

## 1. Verdict per requirement

| #   | Requirement                                 | Verdict                                           | Cost         | Risk     |
| --- | ------------------------------------------- | ------------------------------------------------- | ------------ | -------- |
| 1   | Single-page app, client-side routing        | **Yes, straightforward**                          | Low          | Low      |
| 2   | Prebuilt UI (shell shipped, data async)     | **Yes** — better with static export               | Low          | Low      |
| 3   | Asynchronous client-side data loading       | **Yes** — the data layer is already browser-legal | Medium       | Low      |
| 4   | PWA installability + install prompt         | **Yes, mostly exists already**                    | **Very low** | Low      |
| 5   | Responsive across all devices               | **Already done and enforced**                     | None         | Low      |
| 6   | Offline — app opens, reads cached data      | **Yes**                                           | Medium       | Medium   |
| 7   | Offline — queue writes, replay on reconnect | **Yes, with idempotency work**                    | High         | **High** |
| 8   | "Same as installed Android app"             | **Yes, on Android**                               | —            | —        |
| 9   | "Same as installed iOS app"                 | **~80%. Platform limits are hard**                | —            | —        |

---

## 2. The thing that actually matters: offline changes the money rules

This is the headline finding, and it should be settled before any code is
written, because it is a design decision rather than an implementation detail.

**Today, all aggregation happens in SQL.** ADR-004 and ADR-012 are explicit:
balances come from the `account_balances` and `workspace_totals` views,
dashboard figures come from four `SECURITY INVOKER` RPCs, and
`docs/security.md` says "All aggregation happens in SQL … never in JavaScript."

ADR-012 records why that rule exists. `account_balances` once shipped a defect
where income was attributed to a `NULL` account and vanished from the join. Cash
reported **−10,499** instead of **69,501**. The view compiled, returned rows,
and looked entirely plausible. Only seeding real data exposed it. The
reconciliation invariant it established is:

```
sum(account_balances.balance) == lifetime(total_income) - lifetime(total_expense)
```

**Those views cannot run offline.** They are Postgres SQL executed by PostgREST
against a remote database. There is no Postgres in the browser and none is
coming. So the moment the app must display a balance with no network, one of two
things has to give:

### Option 7a — Offline is read-only against a snapshot

Cache the last successful read of each screen. An offline balance is the
**last known balance**, rendered with an explicit "as of" timestamp and a count
of unsynced changes. No local computation of money at all.

- ADR-004 is untouched. The invariant still holds, because it is only asserted
  against the database.
- ADR-016 ("recurring transactions predict, they do not auto-post") becomes even
  more clearly correct: offline, nothing auto-posts.
- Honest, simple, and the UI has to be careful not to present a stale number as
  a live one.
- **Limitation:** a user who records a transaction offline and then looks at the
  dashboard sees a balance that does not include it, on the same screen where
  the new row is listed. That reads as a bug, and it is one. It needs a
  deliberate, visible treatment, not a subtle one.

### Option 7b — Compute locally over the cached ledger

Mirror the relevant views in TypeScript over an IndexedDB copy of the
transactions table and render a true local balance.

- Gives a consistent offline screen.
- **Cost:** a second implementation of the money logic, in JavaScript, which is
  the exact thing ADR-004 exists to prevent. It is a second answer to "what is
  my balance", and ADR-012's evidence is that a plausible-looking wrong balance
  is undetectable by reading the code. It would need its own seeded-data test
  harness asserting the same invariant against the JS implementation, plus a
  test that the JS and SQL implementations agree on randomised ledgers.
- That test harness is genuinely worth building regardless. But it is real work
  and it is a permanent second source of truth.

### Recommendation

**7a.** Display the last-known balance, timestamped, with a pending-sync count.
It keeps the single-source-of-truth property that this project's whole
architecture is built on, and it is the option that fails visibly rather than
quietly. Revisit 7b only if offline _writing_ proves important enough to pay
for it.

Whichever is chosen needs an ADR that supersedes or qualifies ADR-004, because
the honest answer to "does all aggregation happen in SQL?" becomes "all
aggregation happens in SQL **except what the user sees while offline**."

### 2.1 The second offline problem: token expiry

Supabase access tokens expire — an hour by default. An app that has been
backgrounded on a metered connection cannot refresh one. So:

- **Cached reads must not require a valid token.** The cached ledger renders
  from IndexedDB with no session present at all. This must be designed in from
  the start; retrofitting it means auditing every read path for an accidental
  auth dependency.
- **Only the write outbox needs a session.** It replays when a valid one exists.
- A queued write can therefore sit for hours. By the time it replays, the
  user's balance may have moved. This is correct behaviour, but the UI must say
  so, and the replay must be idempotent (§5.3).

### 2.2 The third offline problem, and the good news

**Good news, and it is not a coincidence:** ADR-016 decided that recurring
transactions _predict_ rather than auto-post. That means the app needs **no
background scheduler and no push-driven writes at all**. A native app would
need a nightly job to check whether rent is due. A PWA does not, because
nothing is due — it is shown as "due" until the user confirms. The absence of
cron was already load-bearing for the free-tier Netlify target; it is equally
load-bearing for PWA viability, because Background Sync is unavailable in Safari.

**Bad news:** Safari on iOS has no Background Sync API at all. The write outbox
must be drained by a foreground event — app open, or `online` firing while the
app is in the foreground — not by the platform. On a phone that is backgrounded
for a day, a queued transaction sits until the user next opens the app. That is
acceptable for a personal ledger. It should be stated, not discovered.

---

## 3. Why the SPA half is unusually cheap

The usual reason a Next.js app cannot become a SPA is that it accumulates
server-side logic. This one has almost none, and the reasons are structural:

### 3.1 Every aggregate is already a browser-callable database object

| Concern                          | Implementation                      | Invoker            |
| -------------------------------- | ----------------------------------- | ------------------ |
| Lifetime workspace totals        | view `workspace_totals`             | `security_invoker` |
| Per-account balance              | view `account_balances`             | `security_invoker` |
| Lifetime expense by category     | view `expense_by_category`          | `security_invoker` |
| Range-scoped totals              | RPC `workspace_totals_for_range`    | `security invoker` |
| Monthly trend incl. empty months | RPC `monthly_totals_for_range`      | `security invoker` |
| Expense per category per range   | RPC `expense_by_category_for_range` | `security invoker` |
| Income per category per range    | RPC `income_by_category_for_range`  | `security invoker` |

All four RPCs have `grant execute … to authenticated`. There is no server-side
aggregation tier to dismantle. A browser client calling `supabase.rpc(...)`
executes under exactly the same RLS context a Server Component does today.

### 3.2 The query syntax already in use is browser-legal

`src/lib/queries/transactions.ts` uses PostgREST embedded joins with FK hints:

```
category:categories ( id, name, type ),
account:accounts!transactions_account_id_fkey ( id, name, kind ),
counterparty_account:accounts!transactions_counterparty_account_id_fkey ( id, name, kind )
```

That is PostgREST syntax, resolved by the same server either way. `supabase-js`
in the browser speaks it unchanged. No query in `src/lib/queries/` needs
rewriting — only the two imports at the top of each file.

### 3.3 Nine of ten `src/lib` modules are already pure

`money.ts`, `dates.ts`, `validations.ts`, `budgets.ts`, `recurrence.ts`,
`csv.ts`, `tone.ts`, `transaction-view.ts`, `site-url.ts` — no server imports,
no Node built-ins. `money.ts` uses `decimal.js`; `dates.ts` uses `Intl` only.

Only `auth.ts` is server-bound, and only by two imports: `redirect` from
`next/navigation` and `createClient` from `@/lib/supabase/server`. Both have
direct browser equivalents.

Two consequences worth stating explicitly:

- **`dates.ts` can run in a browser.** `transactions/page.tsx:44` carries the
  comment "The client never computes a boundary", and `AGENTS.md` hard rule 7
  says ranges must be computed in the user's timezone. The rule survives — but
  it is a **policy**, not a technical constraint. The range logic is pure
  `Intl` and moves to the client unchanged. What cannot move is the _timezone_,
  because it comes from a profile read. See §5.1.
- **The 147 unit tests are unaffected.** They import only pure modules and run
  in `environment: 'node'`. They keep passing unchanged in a browser bundle.

### 3.4 The browser Supabase client already exists

`src/lib/supabase/client.ts` already wraps `createBrowserClient` from
`@supabase/ssr` with the publishable key. It has exactly one consumer today
(`ResetPasswordForm.tsx`), so it is written but unexercised. Nothing needs to be
invented.

Note that `@supabase/ssr`'s browser variant persists the session to
`document.cookie` rather than `localStorage`. That is fine — the cookie is
readable offline — but it is worth being deliberate about, because it is what
makes an offline app able to tell "signed out" from "signed in but stale".

### 3.5 `proxy.ts` is documented as removable

`docs/architecture.md` states it directly: "`proxy.ts` is a **convenience
redirect, not a security boundary.**" ADR-023 explains why: the redirect loop
between `getClaims()` and `getUser()` was a production lockout. With no
server-rendered pages there is no second layer to disagree with, so ADR-023's
entire hazard class disappears rather than needing a fix. Deleting `proxy.ts`
is the _removal of a bug class_, not the removal of a security control.

Authorization is unaffected: `docs/security.md` and ADR-001 both put
authorization in RLS, and RLS is a property of the database connection. The
browser's JWT carries the same claims the server's did.

### 3.6 There are no server-only environment variables

`netlify.toml` documents three variables and all three are `NEXT_PUBLIC_*`. A
static build needs nothing the current build does not already have. There is no
service-role key anywhere and this conversion does not create a reason to add
one — if anything it removes reasons (hard rule 10 stays).

### 3.7 Client-side OAuth needs no server

Supabase supports a fully browser-side PKCE flow: `flowType: 'pkce'` with
`detectSessionInUrl: true`. The client generates the code verifier, stores it,
redirects to the provider, and exchanges the code on return. This is a
documented, first-class path, not a workaround.

It removes `src/app/auth/login/google/route.ts` and
`src/app/auth/callback/google/route.ts` entirely.

**It also dissolves ADR-025.** That ADR exists because the Google route built
its callback from `request.nextUrl.origin`, which on Netlify is the _deploy_
URL, so a deploy preview produced an OAuth callback aimed at production. With
no server, `redirectTo` is whatever the browser sends. A deploy preview sends
its own URL, Supabase compares it against the allowlist, and **rejects it
loudly** if unlisted — instead of silently setting a session cookie on the
wrong host. A misconfiguration that currently looks like success becomes one
that looks like a failure. That is strictly better, and worth noting in the ADR.

---

## 4. Options considered

### Option A — Client-side data in the existing App Router **(recommended)**

Keep Next.js, keep Netlify, keep the file-based routes. Convert each dashboard
page from an async Server Component into a Client Component that fetches through
the browser Supabase client. Add `loading.tsx` per route. Add a service worker
for the app shell and a data cache.

- Everything in §3 keeps working.
- Client Components are still **prerendered at build time** by Next.js, so the
  UI is genuinely prebuilt and the shell is HTML, not a spinner.
- `loading.tsx` gives each route a Suspense boundary whose shell is prefetched
  by `<Link>` — which is exactly what the offline app shell needs (§6.2).
- Route-level code splitting keeps the initial bundle to the tab you landed on.
- `docs/architecture.md`'s directory layout, `proxy.ts`, the Netlify plugin and
  the `postbuild` gate all keep working.
- Optional final step: `output: 'export'` to drop the server entirely.

### Option B — Full static export (`output: 'export'`)

`next.config.ts` is currently `const nextConfig: NextConfig = {}` — nothing
configured, nothing to undo.

Per `node_modules/next/dist/docs/01-app/02-guides/static-exports.md`, the
following are **unsupported** with `output: 'export'`:

- Server Actions
- `Proxy` (so `src/proxy.ts` must go — fine, see §3.5)
- `Headers`, `Redirects`, `Rewrites` (none are configured — fine)
- Route Handlers that rely on `Request`

That last one is the real cost: it kills `/api/export/csv`, all three OAuth
routes, `/auth/signout`, and `/auth/confirm`. CSV export moves to the browser
(client-side generation over the already-loaded data — arguably an improvement,
and `src/lib/csv.ts` is pure and has 14 passing tests). OAuth moves to
client-side PKCE (§3.7). `/auth/signout` becomes `supabase.auth.signOut()`,
which the browser already supports. `/auth/confirm` is kept by ADR-014 "so it can
be enabled later" — a decision to revisit.

Net gain from B over A: static HTML at the CDN edge, no cold starts, no
function invocations, free deploy previews. Cost: the auth routes stop existing,
and `NEXT_PUBLIC_SITE_URL` becomes redundant.

### Option C — Vite + React Router rewrite

Maximum control over the service worker and the client bundle. Rejected:
discards the App Router, the `?sheet=` URL machinery that ADR-030 depends on,
the Netlify plugin, and the type generation that the `postbuild` gate relies on.
The 9.6k-line tree would become a rewrite rather than a refactor, and the
money/date/recurrence logic — the part that is provably correct and well tested
— would be re-litigated for no gain.

---

## 5. What has to change, concretely

### 5.1 The seven duplicated profile reads — the #1 blocker

`.from('profiles')` is inlined in seven places and **never goes through the
query layer**:

```
src/app/(dashboard)/dashboard/page.tsx:29
src/app/(dashboard)/transactions/page.tsx:36
src/app/(dashboard)/reports/page.tsx:36
src/app/(dashboard)/accounts/page.tsx:30
src/app/(dashboard)/budgets/page.tsx:24
src/app/(dashboard)/recurring/page.tsx:24
src/app/api/export/csv/route.ts:76
```

Each returns `timezone`, `currency`, `full_name`. This is the one genuinely
structural blocker, because it creates a bootstrap ordering problem that does
not exist today: **every screen needs the timezone before it can resolve a date
range, and the timezone now arrives from the network.** Server-side, the range
resolution was a single expression over a value already in hand.

Client-side that becomes a two-phase load: profile → ranges → data. It also
means the first paint of every screen is a skeleton, because the range cannot be
computed until the profile lands. ADR-018 and ADR-006 are unaffected in
substance; only the timing changes.

The fix is `getProfile()` in `src/lib/queries/`, memoised per session and
persisted to IndexedDB so the second launch is a single-phase load — and so an
offline launch still has a timezone. **Without a persisted profile, an offline
launch cannot render today's date correctly.**

### 5.2 Twenty `revalidatePath()` calls stop meaning anything

```
src/actions/transactions.ts   10 calls (lines 75,76,106,107,132,133,169,170,197,198)
src/actions/planning.ts        7 calls (lines 95,116,191,220,221,222,239)
src/app/(auth)/actions.ts      2 calls (lines 112,119)
src/app/auth/signout/route.ts  1 call  (line 22)
```

There is no server cache left to revalidate. Each becomes an invalidation in the
client data layer. That is mechanical, but it is 20 places to get right and each
one that is missed is a stale balance — which is the failure mode ADR-024 was
written to prevent.

`revalidatePath('/', 'layout')` in particular becomes meaningless and should be
deleted rather than translated. **This matters more than it looks — see §6.4.**

### 5.3 Thirteen Server Actions become direct client calls

Three `'use server'` modules. Two shapes:

**Six return a typed result** — `{ success }`, `{ error }`, `{ fieldErrors }`.
These drop in almost unchanged.

**Four return `void` and signal failure via
`redirect('/path?error=…')`** — `deleteTransactionAction`,
`deleteBudgetAction`, `postOccurrenceAction`, `deleteRecurringAction` (9
`redirect(` calls total across the action files). ADR-020 documents why: a
thrown Error from a `<form>` action becomes a 500 error page, and deleting an
already-deleted row is a routine race, not an emergency.

In a SPA there is no server response to redirect, so these must return the
error instead. Three pages then stop reading `?error=` from `searchParams`:
`transactions/page.tsx`, `budgets/page.tsx`, `recurring/page.tsx`. The
_behaviour_ ADR-020 wanted is preserved — a readable message, no error page —
but the _mechanism_ changes. ADR-020 needs superseding, not editing.

**Eight forms use `useActionState`.** That hook is for Server Actions; it needs
replacing with local state plus a submit handler. `useTransition` stays valid
and is still required by ADR-022 for anything that navigates.

### 5.4 One piece of security logic moves to the browser — this needs an answer

`postRecurringOccurrence` (`src/lib/queries/planning.ts:226`) re-verifies that a
client-supplied date is genuinely an occurrence of the rule before writing
anything, and advances a `last_posted_on` watermark guarded by
`.or('last_posted_on.is.null, last_posted_on.lt.<date>)`.

ADR-019 explains why this is not paranoia. Before the check existed, a client
could post `2026-12-25` to a monthly rule anchored on the 1st and one request
corrupted both the ledger and the schedule — every genuine occurrence up to that
date became permanently suppressed.

Today that validation is application code behind a server boundary. A browser
can be modified; anything shipped to the client is a suggestion.

There is a database trigger for part of it
(`private.assert_recurring_same_workspace`, which also rejects a
`last_posted_on` earlier than `anchor_date`), but **nothing enforces
occurrence-validity in the database.**

**Recommendation:** move the whole posting operation into a
`SECURITY INVOKER` SQL function — load the rule, validate the date against the
schedule, insert the transaction, advance the watermark — and call it with
`supabase.rpc()`. `SECURITY INVOKER` keeps RLS authoritative; the function body
is the one place a client cannot edit. This is the only item in the conversion
that needs a schema migration, and it is worth doing properly. Eight regression
tests already exist in `src/lib/occurrence-validation.test.ts` and should be
re-pointed at the function.

### 5.5 Offline writes need an idempotency key

If a queued insert replays, or a user double-taps while offline, a duplicate
transaction is written to a financial ledger. ADR-016 already reasons about
exactly this for the online path and settles on a watermark.

For the offline path the mechanism is different and simpler: **generate the
transaction `id` (a UUID) on the client, store it in the outbox, and write with
`.upsert()`**. Replay is then a no-op by construction rather than by
convention. The outbox entry also needs a visible state — pending, syncing,
synced, failed — because a write that silently never lands is worse than one
that visibly failed.

### 5.6 The generated types are stale

`src/types/database.ts` is hand-maintained and self-declares as such. It is
missing the `budgets` and `recurring_transactions` tables and all four reporting
RPCs. Because `client.ts` is created **without** the `Database` generic (a
deliberate decision documented in the file, because supabase-js types `numeric`
as `number` when the wire format is a string) and query modules hand-cast with
`as unknown as`, almost nothing depends on it.

Low cost to fix, but a client data layer is exactly the place where loose typing
starts to bite, and `npm run supabase gen types` is a prerequisite for §5.4.

---

## 6. PWA: installability, prompting, and offline

### 6.1 Installability — three concrete gaps

`src/app/manifest.ts` is already close. `display: 'standalone'`, `start_url`,
`scope`, `name`, `short_name`, `theme_color`, `background_color` are all
correct, and `src/app/layout.tsx` sets `viewportFit: 'cover'` and
`appleWebApp.capable`. The gaps:

**a. One icon, and it is an SVG.**

```ts
icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
```

Chromium's current install check accepts an SVG with `sizes: "any"` and
`purpose: "any"` — the DevTools error string is _"PNG, SVG or WebP format of at
least 144px is required, the sizes attribute must be set, and the purpose
attribute, if set, must include 'any'"_. So it probably passes on Chrome today.
Three reasons not to rely on that:

1. `web.dev` and the Lighthouse audit documentation both still state the
   requirement as **a 192px and a 512px icon**. The documentation and the
   implementation have diverged; documentation loses.
2. **iOS Safari does not use SVG for the home-screen icon.** The manifest icon
   is used on iOS 15.4+ only when no `apple-touch-icon` link exists — and this
   repo has none — so iOS _does_ fall through to it, to a format it may not
   render.
3. Chrome picks the icon for the **Android splash screen** by nearest size match.
   `sizes: "any"` gives it nothing to match.

**b. No `apple-touch-icon`.** With no icon of any kind on iOS 16.4+, the system
draws **a monogram of the site's first letter** on a colour sampled from the
site. For a personal finance app that is the difference between an app on the
home screen and a letter.

**c. No maskable icon.** Android adaptive icons crop to whatever shape the OEM
uses. Without a maskable icon the logo gets its corners cut.

Also worth adding, in descending order of value: `id` (iOS 16.4+ uses `id` +
the user-typed name to keep multiple installs of one site distinguishable, and
without it they collapse), `screenshots` (Chrome shows the minimal install
dialog instead of the rich one), `shortcuts` (long-press the home-screen icon to
jump straight to "add transaction" — a natural fit for this app), and a
`monochrome` icon for themed icons and notification badges.

Concrete asset list: PNG at 192 and 512, maskable PNG at 512, monochrome SVG,
`apple-touch-icon` PNGs at 180/167/152/120, plus `icon.svg` retained.

### 6.2 No service worker exists at all

No `sw.js`, no `service-worker.ts`, no Workbox, no Serwist, no
`next-pwa`, no `navigator.serviceWorker` reference anywhere in `src/`. There
are zero references to `localStorage`, `sessionStorage`, `indexedDB`, `caches`,
`navigator.onLine`, or any offline event listener.

Since Chrome 108 (Android) and 112 (desktop) a service worker is **no longer
required** for installability from the browser menu. But it is still required
here for two reasons:

1. **Chrome's `beforeinstallprompt` heuristic historically still looked for a
   `fetch` handler.** A page can pass the menu installability check and never
   receive the event. Since a custom install prompt depends on that event, the
   event's absence is a user-visible failure.
2. **Without one, an installed TakaKori opened offline shows Chrome's default
   offline page, not the app.** Offline support is a stated requirement.

For the app shell, the cheapest correct mechanism is already built in:
`loading.tsx` per route. Per Next's own offline guide, a route-level
`loading.tsx` gives Next.js a boundary it can prefetch as the route's shell, so
the shell renders offline and the page resumes when the connection returns. The
service worker then only needs to precache that shell plus the JS/CSS chunks.

### 6.3 `experimental.useOffline` is a connectivity banner, not a cache

Next 16 ships `experimental.useOffline` and a `useOffline()` hook. It is worth
being precise about what it does, because the name invites the wrong
assumption:

- It listens for `offline`/`online` events and detects failed framework
  requests.
- A failed navigation, prefetch or Server Action **stays pending and is retried**
  when connectivity returns, polling with `HEAD` requests, backoff capped at 3s.
- It exposes `useOffline()` for a banner.

It is **not** a cache. The docs are explicit: _"A full page reload while offline
still fails because the browser needs the network to deliver the HTML; full
offline loads would need a service worker."_ And it does not apply at all to
requests you issue yourself — which after this conversion is **all** the data
requests, because they go through `supabase-js` and not `fetch`.

So: enable it for the banner (it is a genuine improvement over
`navigator.onLine`, which reports `true` for a device on a WiFi with no upstream
internet) and pair it with a service worker and a real data cache. Do not count
it as the offline feature.

### 6.4 Two concrete landmines

**`revalidatePath('/', 'layout')` breaks `@serwist/turbopack`.** This is worth
knowing before choosing a service-worker tool. `@serwist/turbopack` compiles the
service worker through a Route Handler that runs esbuild at build time. That
route prerenders with the **root-layout implicit cache tag**, which every
prerendered route in the app carries. Any call to `revalidatePath('/', 'layout')`
resolves to exactly that tag — and it is the standard "flush everything" idiom
for clearing cached auth state.

The result, reproduced on production: `revalidatePath('/', 'layout')` evicts the
prerendered service worker and forces a background regeneration, and the handler
throws `ERR_MODULE_NOT_FOUND: next/dist/server/config.js` because output file
tracing never followed the dependency into the function bundle. One commenter
reports a **100% failure rate** on `/serwist/sw.js` after setting
`dynamic = 'force-dynamic'` as a workaround. Deploys mask it entirely — the
route serves build output until the first `revalidatePath`.

**`src/app/(auth)/actions.ts:112` and `:119` and `src/app/auth/signout/route.ts:22`
all call `revalidatePath('/', 'layout')`** — on sign-in and sign-out, the two
most frequent authenticated events in the app's life.

Two ways out, and the SPA conversion picks the second one for free:

1. Use a hand-rolled service worker, or `@serwist/next`, and avoid the trap.
   `@serwist/next` is webpack-only and fights Next 16's Turbopack default.
2. **Remove the Server Actions.** Once writes are direct client calls there is no
   `revalidatePath` at all, and the class of bug is gone. Worth noting that
   ADR-024, which put the CI gate in `postbuild`, also depends on the
   `next build` behaviour that produces those implicit tags — so this is not a
   change to make casually.

**A stale service worker plus an SPA catch-all serving `index.html` at `/sw.js`**
is the other classic. Browsers cache service worker scripts for ~24 hours and do
not re-check on reload. Chrome 68+ ignores cache headers for the SW script unless
`updateViaCache: 'none'` is passed at registration. Add both, and make sure no
Netlify rewrite swallows `/sw.js`. Note that Netlify overrides `Cache-Control`
on function responses in some configurations — use `[[headers]]` in
`netlify.toml`, which Netlify's own guidance recommends for exactly this.

Also: pin a known-good Serwist version. `@serwist/turbopack` 9.5.5 shipped a bug
where precached `public/` files were requested under the `/serwist` prefix and
404'd, silently preventing the service worker from activating (fixed in 9.5.6).

### 6.5 The install prompt cannot be prompt

This is the requirement most likely to disappoint, and it is a platform
limitation, not an implementation gap.

**Chromium gates `beforeinstallprompt` behind engagement heuristics.** The page
must be served over HTTPS, the user must have clicked or tapped the page at
least once (on any previous load), and the user must have spent **at least 30
seconds** on the site. Until both are satisfied, DevTools can report
"installable" while no event ever fires. On first visit, an immediate install
prompt is impossible.

**iOS never fires it at all.** No version of iOS fires `beforeinstallprompt` or
exposes an install API. The only route is the user's own gesture: Share →
Add to Home Screen. The app's job is to teach that gesture, not to trigger it.
On iOS 26 the user can turn off "Open as Web App" while adding, which produces a
bookmark instead of a web app, and nothing the page does can prevent that.

So a correct install prompt is **three** things, not one button:

| Platform          | Mechanism                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chromium          | Capture `beforeinstallprompt`, show a dismissible prompt, and _also_ let the native mini-infobar run. Suppress the native one only if the custom banner is reliably better, and only if a dismissal is remembered. |
| iOS 16.4+         | An instructional sheet naming the actual gesture — Share, then Add to Home Screen — with an illustration. Next's own PWA guide ships this pattern.                                                                 |
| Already installed | Detect via `matchMedia('(display-mode: standalone)').matches` and `navigator.standalone === true` (Safari only), and show nothing.                                                                                 |

Dismissal must persist (`localStorage` or IndexedDB) or the prompt becomes
annoying, which is worse than not having it. And it must never appear over the
transaction form — ADR-030's rule is that a screen lists first and creates in a
sheet; an install banner over either would violate that.

### 6.6 What a PWA cannot do that a native app can

Stated plainly so it is not discovered later:

| Capability                     | Android                    | iOS                                  |
| ------------------------------ | -------------------------- | ------------------------------------ |
| Install without a user gesture | No (30s + click heuristic) | No (Share sheet only)                |
| Background Sync API            | Yes                        | **No**                               |
| Periodic background sync       | Yes                        | **No**                               |
| Push notifications             | Yes                        | 16.4+, home-screen installs only     |
| True background execution      | No                         | No                                   |
| Store listing / review process | No                         | No                                   |
| `navigator.vibrate`            | Yes                        | **No**                               |
| Native share sheet             | No                         | No                                   |
| Splash screen control          | Yes                        | Only via `apple-touch-startup-image` |
| Home-screen icon from manifest | Yes                        | SVG not used; needs PNG              |
| Offline after eviction         | Chrome may evict           | **iOS evicts aggressively**          |

Two of these are already handled by existing decisions. ADR-016 means there is
no background work to schedule, so the absence of Background Sync costs
nothing. And ADR-007 already made TakaKori single-workspace-per-user, so
multi-install / multi-workspace confusion does not arise.

The genuinely open one is **iOS storage eviction**. iOS can purge IndexedDB for a
home-screen web app that goes unused. Mitigation is to keep the offline cache
small (the last N transactions, not all of them) and treat a cache wipe as a
normal cold start rather than an error. Worth verifying on a real device rather
than trusting the general guidance.

One more, small but real: **expect a re-login on first launch in standalone.**
The installed app is a separate context from the Safari tab, and it should not be
assumed to share a session. This is a five-second surprise for a user who was
signed in in the browser.

---

## 7. What this costs the existing guarantees

### 7.1 All 31 Playwright tests break

This is the largest hidden cost and it is not optional.

| Suite                | Tests                | Fate                                                                                                                        |
| -------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `e2e/flows.spec.ts`  | 11                   | Rewrite. All assert server-rendered markup and Server Action round-trips.                                                   |
| `e2e/sheets.spec.ts` | 11                   | Mostly survives — `<dialog>`, `showModal`, Escape, back-button, inertness are all browser behaviour. Highest survival rate. |
| `e2e/layout.spec.ts` | 4 decl. / 9 concrete | Survives, **but needs a state change.** See below.                                                                          |
| `*.test.ts` (Vitest) | 147                  | **Unaffected.** Pure modules, `environment: 'node'`.                                                                        |

The rewrite is real work: the transfer test (ADR-005's central accounting
guarantee), the "creating an expense moves total by exactly −12345 poisha" test,
and the stale-cookie / redirect-loop regression guard from ADR-023 are all
asserting things that no longer exist in the same form. The stale-cookie guard
in particular guards a bug that **ceases to exist** when the server is gone —
that test should be deleted with a comment pointing at ADR-023, not ported.

`layout.spec.ts` needs a genuine adjustment. It asserts no horizontal overflow,
no field under 16px, and the tab bar inside the viewport. Those must now run
against the **loaded** state, not the skeleton — a skeleton is a different
layout from a full transaction list, and a skeleton-only pass would prove
nothing. ADR-029's four causes were all found in real rendered content.

The definition of done in `AGENTS.md` is `npm run verify`. After this conversion
`verify` still runs (build → typecheck → lint → test), but its integration
coverage drops to zero until the Playwright suite is rewritten. That gap should
be closed inside the same change, not after it.

### 7.2 The bundle grows, and this app has a documented reason to care

ADR-026 rejected a charting library as "~100 KB of client JavaScript" for users
on metered connections. ADR-028 explains the app is used "one-handed, on a
metered connection, in a hurry."

Today the client bundle carries only interactive islands. After this conversion
it carries all eight dashboard screens, all forms, and `@supabase/supabase-js`.
That is the real cost of "prebuilt all UI" and it runs directly against two
accepted ADRs.

Mitigations, all built into Next.js:

- Route-level code splitting via `next/dynamic` per tab — the entry bundle grows,
  but `/reports` is only loaded if you visit it.
- Keep the tab bar and the sheet host eager; lazy-load the sheet _bodies_.
- Measure the actual first-load JS before and after. A number, not a feeling.
- If it regresses badly, revisit ADR-026 explicitly. Do not silently ship a
  400 KB bundle.

### 7.3 The client data layer needs a decision about dependencies

Three candidate designs:

1. **Hand-rolled** — ~200–300 lines: request dedup, a cache map, invalidation,
   retry, offline read-through, optimistic update. Matches the house style
   (ADR-026: "reaching for a package first is the wrong instinct in this
   codebase") and adds **zero** runtime dependencies to a project with seven.
   Cost is permanent test burden.
2. **TanStack Query** + `@tanstack/query-persist-client` + `idb` — gives all of
   the above including IndexedDB persistence, which is the fiddliest part. Adds
   roughly 10–40 KB.
3. **SWR** — lighter, less complete on the persistence side.

**Recommendation: TanStack Query with the IndexedDB persistence plugin.**

This is a genuine departure from ADR-026, and the reason is that ADR-026 is
about _visual_ libraries — a charting library and an icon package, both of which
draw something. A data-orchestration cache is a different category, and the
offline requirement makes IndexedDB persistence load-bearing rather than
optional. Hand-rolling it means hand-rolling persistence, retry, race
cancellation, and garbage collection.

If that is rejected, option 1 is defensible — but then the decision needs its
own ADR explaining why, because "we hand-rolled a query cache" is exactly the
kind of thing this codebase's own documentation warns against without a reason.

### 7.4 Documentation and rules that become false

| Artefact                                                                   | What breaks                                                                                               |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` hard rule 1 (`proxy.ts` exists)                                | Inverted — it no longer exists                                                                            |
| `AGENTS.md` hard rule 7 (ranges in user's timezone)                        | Still true, but computed in the browser; needs the profile-bootstrap caveat                               |
| `AGENTS.md` hard rule 11 (design system)                                   | Needs roles for offline banner, install prompt, sync badge                                                |
| `docs/architecture.md` "Rendering model"                                   | Describes Server-Component fetching; now false                                                            |
| `docs/architecture.md` "Caching" (`cacheComponents` off, `revalidatePath`) | Both obsolete                                                                                             |
| `docs/security.md` "Sessions" (`proxy.ts` refreshes the session)           | Obsolete; `docs/security.md` checklist item 4 ("every Server Action calls `requireUser`") needs rewriting |
| ADR-007, ADR-020, ADR-023, ADR-024, ADR-025                                | Supersede (do not edit — `docs/decisions.md` says append and supersede)                                   |
| ADR-004, ADR-012                                                           | Qualify, per §2                                                                                           |
| `docs/roadmap.md`                                                          | Add the new phases                                                                                        |

`docs/roadmap.md` already lists **"Mobile apps"** under _Not planned_. That
entry needs rewriting, because this change delivers the thing it was ruling out.

### 7.5 Responsive: already solved, but re-verify after conversion

Worth stating plainly: ADR-029 and `e2e/layout.spec.ts` already cover this at
320/360/390/412px, with the four root causes documented (iOS auto-zoom,
min-content grid tracks, `sr-only` in a scroll container, nested flex rows).
`--nav-height` / `--nav-clear` are declared together in `globals.css`. Nothing
about the SPA conversion regresses this directly.

Two things to check anyway:

1. **Skeleton vs. loaded state**, as in §7.1. Measure the real layout.
2. **Scrollbar stability.** Server-rendered HTML has a known content height
   before paint. A client-rendered list that grows after hydration can introduce
   or remove a scrollbar, shifting every centred element — including the
   bottom tab bar. `scrollbar-gutter: stable` on the scroll container is the
   fix, and it should be added as part of this work rather than after someone
   reports a jumping tab bar.

---

## 8. Recommended plan

Each phase is independently shippable and independently revertible. Phases 0–2
get the SPA. Phase 3 gets offline reads. Phase 4 gets offline writes.

### Phase 0 — Installable PWA _(no architecture change, ~1 day)_

The cheapest win on this list and it needs nothing else.

1. Generate PNG icons: 192, 512, maskable 512, monochrome SVG. Keep `icon.svg`.
2. Add `apple-touch-icon` at 180/167/152/120, and `apple-touch-startup-image`.
3. Rewrite `manifest.ts`: the full icon set, `id`, `screenshots`, `shortcuts`
   (add-transaction first), `display_override`.
4. `InstallPrompt.tsx` — `beforeinstallprompt` capture + `localStorage`
   dismissal on Chromium; the Share-sheet instruction on iOS; nothing when
   already installed.
5. Enable `experimental.useOffline` and add an `OfflineBanner` in the root
   layout.

Nothing here can break data access. It is the phase to do first because it
converts directly into installs, which is the actual goal.

### Phase 1 — Client-side reads

1. `npm run supabase gen types` — prerequisite for everything typed (§5.6).
2. Add `getProfile()` to `src/lib/queries/`; delete all seven inlined reads.
3. Swap `@/lib/supabase/server` → `@/lib/supabase/client` and
   `requireWorkspaceId` → a browser equivalent in the four query modules.
   Add `import 'server-only'` to `lib/auth.ts` and `lib/supabase/server.ts` so
   the boundary becomes enforceable — cheap, and it stops the mistake recurring.
4. Convert the eight dashboard pages to Client Components with `loading.tsx`.
5. Add the client data layer (§7.3) with read-through caching.
6. **Rewrite the Playwright suite** for the loaded state before this phase is
   called done.

At the end of Phase 1 the app is a SPA that reads client-side and still writes
through Server Actions. Mixed mode is a legitimate intermediate state and keeps
the diff reviewable.

### Phase 2 — Client-side writes

1. Thirteen actions → direct client mutations.
2. Six typed returns drop in; four `redirect('/x?error=')` become returned
   errors; pages stop reading `?error=` from `searchParams`.
3. Twenty `revalidatePath` calls → cache invalidations; the three
   `revalidatePath('/', 'layout')` calls are **deleted**, not translated (§6.4).
4. Eight `useActionState` forms → local state + `useTransition` (ADR-022 holds).
5. Move `postRecurringOccurrence` into a `SECURITY INVOKER` SQL function
   (§5.4). **This is the one migration in the whole project.**
6. `src/app/auth/login/google` and `auth/callback/google` → client-side PKCE.
   Possibly `/auth/signout` too.
7. `scrollbar-gutter: stable`.

### Phase 3 — Offline shell and cached reads

1. Service worker precaching the app shell and route shells (`@serwist/turbopack`
   on a pinned version, or hand-rolled). Add the `netlify.toml` `[[headers]]`
   entry and `updateViaCache: 'none'`.
2. Persist the profile to IndexedDB — **without it an offline launch has no
   timezone** (§5.1).
3. IndexedDB read cache behind TanStack Query persistence. Bound its size.
4. Timestamp every cached figure and render "as of <time>" (§2, Option 7a).
5. A `~offline` route for a cold start with nothing cached.

### Phase 4 — Offline writes

1. Outbox in IndexedDB, client-generated UUIDs, `.upsert()` on replay (§5.3).
2. Visible pending / syncing / synced / failed state on every queued row.
3. Drain on app open and on `online` while foregrounded. Safari will never drain
   in the background (§2.2) — say so in the UI.
4. Offline-first conflict policy. ADR-016's watermark reasoning applies directly.

### Phase 5 — Optional: eliminate the server

`output: 'export'`, delete `proxy.ts`, delete the last route handlers, drop
`NEXT_PUBLIC_SITE_URL` and supersede ADR-025. Only worth doing if the CDN and
cold-start numbers justify losing the OAuth route handlers.

---

## 9. Open questions for the decision

1. **Which offline option?** §2 — 7a (timestamped snapshot) or 7b (compute
   locally). _This is the first thing to settle; it changes ADR-004._
2. **Is offline _writing_ actually required, or is offline _reading_ enough?**
   Phase 4 is the most expensive and the highest-risk part of this document.
   A personal ledger that queues a transaction until the app is next opened is
   arguably fine.
3. **TanStack Query, or hand-rolled?** §7.3. Either is defensible; picking
   without a reason is not.
4. **Is `output: 'export'` worth losing the route handlers?** Option B vs.
   Option A + Phase 5.
5. **Is the bundle regression acceptable?** §7.2 — measure first, then decide
   whether ADR-026 needs revisiting.

---

## 10. Sources

Everything asserted from the codebase was read in the tree, with file and line
citations above. Everything about platform behaviour comes from:

- `node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md`
- `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`
- `node_modules/next/dist/docs/01-app/02-guides/offline-support.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-offline.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/useOffline.md`
- `node_modules/next/dist/docs/01-app/02-guides/static-exports.md` (§Unsupported Features)
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md`
- Supabase docs — PKCE flow, implicit flow, sessions
- Chromium `chrome/browser/installable/installable_manager.cc` (icon check)
  and `docs/webapps/installation_pipeline.md` (promotability gates)
- `developer.chrome.com/blog/update-install-criteria` (SW fetch-handler
  requirement removed in Chrome 108/112)
- Apple, _Configuring Web Applications_ (`apple-touch-icon`, standalone mode,
  startup images)
- `serwist/serwist` issues #339, #348, #360 (Turbopack precache path bug;
  `revalidatePath('/', 'layout')` triggering the SW route at request time)
- Netlify docs and support threads on service worker cache headers

**Not verified, and should be before Phase 3:** iOS IndexedDB eviction
behaviour for home-screen web apps in practice; whether a signed-in Safari
session carries into the standalone install; `beforeinstallprompt` engagement
heuristic timing on current Chromium. These need a real device, not documentation.
