# Roadmap

Status: **Product phases 0–3 complete.** A separate programme converted the app to
a client-data single-page app with offline reads and offline writes; see
[`spa-pwa-feasibility.md`](./spa-pwa-feasibility.md) for its six phases and
[`decisions.md`](./decisions.md) ADR-032 through ADR-045 for what has been
decided since.

**Both halves of that programme are done.** The table below previously said the
write half had not started; it had, and the claim was stale by the time it was
written.

| Step                                      | State                                                    |
| ----------------------------------------- | -------------------------------------------------------- |
| Installable PWA (icons, manifest, prompt) | Done, and the prompt's engagement gate was restored      |
| Transport-agnostic query layer            | Done — `lib/queries/` reads on either transport          |
| Cache invalidation map                    | Done, and it caught a live stale-balance bug on the way  |
| Client data on **all seven** screens      | Done — no screen reads through `queries/server` any more |
| Writes clear the cache                    | Done — every mutating action now returns a result        |
| Mutations run in the client               | Done — ADR-041; the action's result owns `pending`       |
| Offline writes (outbox)                   | Done — ADR-042 and ADR-043; "saved on this device"       |

**Four things worth knowing before touching this area again:**

The read path was converted _before_ the writes that could invalidate it. For a
window of commits a purchase wrote its row and the dashboard kept showing the
balance from before it. `useWriteInvalidation` closes it — wired into thirteen
call sites, and its identity is `(done, attempt)` rather than the success value,
because two consecutive successes return the same string and the second was being
swallowed. That is the ADR-012 shape: a stale balance beside a row list that *had*
updated.

Queuing writes was deliberately sequenced behind verifying read-invalidation.
Queuing writes against unverified invalidation is worse than having no offline
support at all.

**Two screens no longer render without JavaScript.** `/reports` and
`/transactions` put their whole body in one client component, because their
content is aggregates and rows whose date range is resolved from the profile's
timezone — a browser read now. Splitting the header out and leaving the figures
behind would give a screen with a period selector and no data under it, which
reads as broken rather than unavailable. The other five keep a prerendered shell,
and their Add links, filter controls and export are real `<a>` and `<Link>`
elements, so the paths in still work without a bundle.

**Verified since this table was written, by driving a real browser:**

- A Google OAuth round-trip, end to end — see Phase 1. Previously "not verifiable
  from a dev machine"; it needed a person to click Google's consent screen, which
  is what made it possible.
- True offline navigation, with the network severed at the browser and an
  uncached request confirmed to fail. Reload and cold navigation both serve the
  cached shell with figures from IndexedDB, the offline banner appears, and an
  offline save now returns an error in ~500ms instead of hanging (ADR-041).
- Offline replay of `transaction.create`, proven against the real table: a queued
  write drains, a replayed insert is rejected naming `transactions_pkey`, the row
  count stays at 1, and a description edited after queueing is not overwritten.

**Still not verified.** Ten queued write kinds are implemented and nine are wired
to call sites, but only `transaction.create` has been driven through the UI. The
one that was found three invisible bugs in — an IndexedDB `DataError`, a sheet
stuck open offline, a drain that announced before doing work — is the reason the
other nine deserve the same distrust.

**And still not verifiable from a dev machine:** the Netlify `[[headers]]` entry
for `/sw.js`. Measured, not assumed: `https://takakori.netlify.app/sw.js` returns
**404**, because production runs `origin/main` and `public/sw.js` does not exist
there — it is on branch `X1`, 26 commits ahead. So the offline half of this
programme is not live at all. A cached worker script means a user runs last week's
offline behaviour against this week's JavaScript, so a preview deploy is the next
step before production.

## Phase 0 — Foundation ✅

- [x] Next.js 16 + TypeScript + Tailwind 4 scaffold
- [x] Supabase SSR clients (browser / server / proxy)
- [x] `src/proxy.ts` session refresh
- [x] Database migrations: schema, RLS, provisioning, views
- [x] `lib/money.ts` with string-safe parsing and correct BDT formatting
- [x] `lib/dates.ts` with timezone-aware range resolution
- [x] `lib/validations.ts` Zod schemas
- [x] `lib/auth.ts` session guards
- [x] 295 unit tests (49 at Phase 0, 178 through the client-data programme — see above)
- [x] `npm run verify` green (typecheck, lint, test, build)
- [x] Documentation, 6 agent skills, `AGENTS.md`
- [x] **Netlify site connected** — verified: `takakori.netlify.app` answers `/`
  and `/login` with 200. See [Deployment](#deployment) for what that deploy is and
  is not.
- [ ] **`supabase login` + `supabase db push`** — **still open, and it is the only
  item left in Phase 0.** The schema is applied and verified; what is missing is the
  CLI *history* agreeing with it.

  Three migrations were applied out of band and recorded under a tool's timestamp
  rather than the filename (`20261006130644`, `20261006130810`, `20261009043814` vs
  `20261006120000`, `20261006120100`, `20261009090000`). The versions are now
  reconciled and the schema verified to match the files, so a push should be a no-op.
  See `docs/database.md` for the drift and the repair procedure.

  What blocks it is credentials, not work: `supabase login` is interactive, and the
  CLI rejects the legacy `cli_<user>@<host>_<timestamp>` token format. It wants a
  personal access token — `sbp_…` — from the Supabase dashboard.

## Phase 1 — Vertical slice

Goal: one user can sign up, add a transaction, and see it on a dashboard.

- [x] **Auth pages** — signup, login, logout, email confirmation, password reset
- [x] **Google OAuth** — client-side PKCE (ADR-036; the two route handlers are
      deleted). Verified end-to-end in a browser: the authorize request is built
      with the right `client_id`, `scope` and `redirect_to`; Supabase accepts the
      redirect only if it is allowlisted; the code verifier is written to
      `document.cookie` before leaving and read back after the round-trip; the
      exchange yields a session that survives a reload; and the Google identity
      **links** to the existing user — one user in the project with providers
      `email,google` — so no data is orphaned. `next` is honoured on arrival and
      both open-redirect vectors (`https://…` and `//…`) are refused.
- [x] **Transactions** — create, read, update, delete
- [x] **Accounts and categories** — create and list
- [x] **Dashboard** — total balance, month income/expense/savings, recent
      transactions, per-account balances
- [x] **Filters and pagination** — period, type, category, account; URL-driven
- [x] **CSV export** — `/api/export/csv`, verified returning 401 when signed out
- [x] **Range-scoped totals** — `workspace_totals_for_range` RPC
- [x] **RLS verified live** — cross-tenant read/update/delete denied, 7
      invariants rejected, reconciliation checked
- [x] **Seed script** — `npm run seed`, asserts the ADR-012 invariant

### Blocked on one thing — since resolved

This section used to read "no signed-in session has been exercised yet". It has:
47 E2E tests run against the linked project, every one of them signed in.

The blocker was that free-tier Supabase caps outbound email, so signup returned
`429 over_email_send_rate_limit` and no confirmation link was ever sent. Writing
rows into `auth.users` by hand is not a workaround: GoTrue keeps
`auth.identities.email` as a generated column and returns
`500 Database error querying schema` for a hand-made identity row.

It was resolved by adding a service-role key to `.env.local` and running
`npm run seed`, which uses `auth.admin.createUser({ email_confirm: true })` and
so bypasses email entirely. The key is gitignored and has never been committed.

### A consequence of `NEXT_PUBLIC_SITE_URL`

That variable is now set in `.env.local` to `https://takakori.netlify.app`, which
is correct for the deployed app — but `.env.local` is what the **dev** server
reads. Email-confirmation and password-reset links generated locally therefore
redirect to production rather than to localhost. That is harmless while
production is the only deploy, and worth knowing before testing either flow
against a local build.

## Phase 2 — Reports ✅

- [x] **Period selection** — this month, this quarter, this year, last 12 months,
      resolved server-side in the user's timezone
- [x] **Income vs expense per month** — CSS bars, no charting library, plus a
      real table for screen readers and precise figures
- [x] **Where the money went / came from** — category breakdown with share
- [x] **Savings rate** — shown as a percentage, negative when overspending
- [x] **Empty months reported as zero** rather than omitted, so a saving streak
      reads as a run of bars instead of collapsing to one
- [x] **Orphaned transactions visible** — a deleted category shows as
      "Uncategorised" rather than disappearing from the breakdown

Verified in the running app: 80,000 income × 3 months against four expense
categories, reconciling to the period total to the poisha.

Deliberately no charting library. Both series are simple bars, and a library
would add ~100 KB of client JavaScript to a mobile app aimed at users on metered
connections. `components/reports/Charts.tsx` has one clear entry point to
replace if reports ever need genuinely complex charts.

### Still open

- [ ] ~~**Google OAuth**~~ — done and verified end to end; see above
- [x] **Netlify** — connected, and serving

---

## Deployment ✅

Live at **https://takakori.netlify.app** (deploy `6abe306f87836e0ce8e34269`,
production context, branch `main`).

Verified in production, not assumed from a green build:

| Check                        | Result                                                |
| ---------------------------- | ----------------------------------------------------- |
| `/` and `/login`             | 200, form renders                                     |
| Unauthenticated `/dashboard` | redirects to `/login` — `proxy.ts` works on Netlify   |
| Sign in                      | session established, dashboard renders                |
| Server Action write          | ৳1,234.56 stored exactly                              |
| CSV export                   | 200, correct filename, 12 rows, no truncation warning |
| All 8 routes                 | render without server errors                          |

Environment variables set on the Netlify site for `builds` and `runtime`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL=https://takakori.netlify.app`

There is deliberately **no service-role key**. Every query runs as the
signed-in user under RLS.

### Before a real public launch

Google OAuth and the redirect allowlist were both **already correct** and needed no
dashboard changes. Verified rather than assumed:

- `GET /auth/v1/settings` reports `"google": true`, and
  `/auth/v1/authorize?provider=google` returns a real Google client id
  (`955264998034-…apps.googleusercontent.com`).
- The authorize call passes `redirect_to=https://takakori.netlify.app/auth/callback/google`
  through to Google unchanged, which only happens when the allowlist already
  accepts it. A missing entry would have been replaced with the site URL.
- Driving "Continue with Google" in a browser reaches Google's real sign-in page
  with no `redirect_uri_mismatch`, so the Supabase callback is registered in
  Google Cloud too.

That audit found a real bug anyway. The Google route built its callback from
`request.nextUrl.origin` — the incoming Host header, which on Netlify resolves to
the deploy URL — so the deploy preview produced an OAuth callback aimed at
`6abe50ca--takakori.netlify.app` instead of production. Fixed in ADR-025; all
auth redirects now come from `NEXT_PUBLIC_SITE_URL`, and a missing value throws
in production rather than failing silently.

1. ~~**Google OAuth**~~ — already enabled and working. No action needed.
2. ~~**Supabase redirect allowlist**~~ — already accepts the production callback.
3. ~~**Free tier pauses**~~ — accepted as an acceptable trade-off for a personal
   app. A pause shows signed-in users an error rather than an empty dashboard, so
   it is a known cost rather than a blocker.
4. **CI** — replaced. Netlify's build now runs `npm run verify`, so every push is
   gated without needing the `workflow` OAuth scope (ADR-024). The workflow file
   is no longer needed and has been removed.

---

## Phase 3 — Budgets and recurring ✅

- [x] **Budgets** — per-category or overall, with spend, remaining, percent used
- [x] **Pace projection** — daily rate and projected month-end spend, because
      "3,000 of 10,000" is not actionable on its own
- [x] **Recurring rules** — daily/weekly/monthly/yearly with an interval
- [x] **Predict and confirm** — nothing posts automatically; one tap writes the
      real transaction (ADR-016)
- [x] **Month-end clamping** — a 31st anchor lands on 28/29 February rather than
      overflowing into March or skipping the month
- [x] **Idempotent posting** — a watermark makes a replayed or double-clicked
      occurrence match zero rows instead of duplicating a financial record

Verified against the database: 11 constraints rejected as designed, including an
income-category budget, duplicate overall budgets, a transfer rule with no
destination, and a `last_posted_on` earlier than the anchor. Duplicate
protection proven by replaying a posted occurrence and confirming the guard
blocks it while a later occurrence still succeeds.

Two bugs found and fixed during this phase:

- Weekly and daily rules rounded the elapsed interval count to zero, returning
  the anchor date — which is by definition before the cursor.
- Budget days-elapsed was exclusive, understating the daily rate by a day.

## Phase 4 — Polish and reach

Not started. An earlier version of this file had a second heading also numbered
"Phase 3", directly beneath the first, which made it impossible to tell what was
proposed from what was shipped.

- Bangla (`bn-BD`) localisation
- Onboarding
- Sentry for production errors

### Previously listed here and now done

The list under this heading once read "The schema already supports transfers;
only the UI is missing" and named four gaps. All four shipped:

- Transfer form — in `AddTransactionSheet`, and E2E-covered end to end
- Per-account balances (`account_balances` view)
- Account management UI — create, edit, archive, remove
- Multiple accounts — Cash, bank, bKash, Nagad, card

Balance **corrections** also landed here afterwards, as an `account_adjustments`
table rather than a fourth transaction type (ADR-045), with a visible breakdown of
where a balance comes from.

## End-to-end tests ✅

`npm run test:e2e` drives a real browser against the linked development
project — **47 tests, all passing** (10 at this section's last edit). Credentials
come from `.env.test` (gitignored); see `.env.test.example`.

Covered: unauthenticated redirect, dashboard rendering, creating an expense and
watching the total move, a transfer moving money between accounts **without**
changing the total, an invalid amount being rejected without a 500, the period
filter, CSV export, reports, budgets, recurring, and sign-out.

The transfer test is the one that matters most. It asserts the central
accounting guarantee (ADR-005) from the rendered strings rather than from
internal state: the total is unchanged to the poisha while the destination
account gains exactly 250,000.

Two real bugs surfaced here that 124 unit tests and a green `verify` both
missed:

- **The filter bar latched into `disabled` after one change.** `setPending(true)`
  was never reset, so a user could set a period and then never a category. Fixed
  with `useTransition` (ADR-022).
- **Transfers were never exercised through the UI at all.** Verified manually
  first: Cash and Bank moved ৳2,500 while total, income, and expense all stayed
  put.

A third was found only by using the live site, not by any test: **`/login` and
`/dashboard` could lock each other in an infinite redirect loop** on production.
The proxy decided "signed in" with a local JWT signature check while the page
guard asked the auth server, and when they disagreed the two redirect rules
fought. Fixed in ADR-023. The exact trigger was not reproducible locally, so the
fix removes the class of bug rather than one observed instance.

Cleanup runs through the app's own delete button, not a test-only route or a
service-role script — see the reasoning in the `testing` skill. The suite leaves
the account exactly as it found it: verified at 10 rows and zero leftovers after
a full run.

Note that `npm run verify` does not run E2E, because it needs a browser and a
live database.

## Not planned

Deliberately out of scope until the personal app is genuinely used:

- Multi-currency
- Teams and organisations
- Double-entry bookkeeping, invoicing, payroll
- Bank integrations
- Mobile apps
- Subscription billing

## Principles

- **Personal app, SaaS-shaped data.** One workspace per user now; sharing is a
  row in `workspace_members`, not a migration.
- **Free Supabase projects pause after a week of inactivity.** Before a public
  launch, either upgrade or accept the pause policy and tell users.
- **Migrations only.** No schema change through the dashboard.
- **No Docker.** Database tests run against the linked dev project. Installing
  Docker Desktop would enable `supabase start` and faster local iteration.
