# Roadmap

Status: **Phase 0 complete**, Phase 1 next.

## Phase 0 — Foundation ✅

- [x] Next.js 16 + TypeScript + Tailwind 4 scaffold
- [x] Supabase SSR clients (browser / server / proxy)
- [x] `src/proxy.ts` session refresh
- [x] Database migrations: schema, RLS, provisioning, views
- [x] `lib/money.ts` with string-safe parsing and correct BDT formatting
- [x] `lib/dates.ts` with timezone-aware range resolution
- [x] `lib/validations.ts` Zod schemas
- [x] `lib/auth.ts` session guards
- [x] 49 unit tests
- [x] `npm run verify` green (typecheck, lint, test, build)
- [x] Documentation, 6 agent skills, `AGENTS.md`
- [ ] **`supabase login` + `supabase db push`** — needs interactive login
- [ ] **Netlify site connected** — needs dashboard access

## Phase 1 — Vertical slice

Goal: one user can sign up, add a transaction, and see it on a dashboard.

- [x] **Auth pages** — signup, login, logout, email confirmation, password reset
- [x] **Google OAuth** — PKCE via route handlers; needs the provider enabled in
      the dashboard plus the `{SITE_URL}/auth/callback/google` redirect URL
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

### Blocked on one thing

The app renders and the API correctly rejects unauthenticated access, but **no
signed-in session has been exercised yet.**

Free-tier Supabase caps outbound email, so signup returns
`429 over_email_send_rate_limit` and no confirmation link is ever sent. Writing
rows into `auth.users` by hand is not a workaround: GoTrue keeps
`auth.identities.email` as a generated column and returns
`500 Database error querying schema` for a hand-made identity row.

Two supported ways out, either is enough:

1. **Add a service-role key** and run `npm run seed`. One line in `.env.local`:

   ```
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
   ```

   The script uses `auth.admin.createUser({ email_confirm: true })`, which
   bypasses email entirely.

2. **Disable "Confirm email"** in Supabase → Authentication → Providers →
   Email. Signup then returns a session immediately. Simplest for local work,
   but must be turned back on before any public launch.

Charts come after the data is trustworthy. A chart of a wrong number is worse
than no chart.

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

- [ ] **Google OAuth** — provider must be enabled in the Supabase dashboard
- [ ] **Netlify** — not connected; needed for deploy previews

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

1. **Google OAuth** — enable the provider in the Supabase dashboard and
   register `{SITE_URL}/auth/callback/google`.
2. **Supabase redirect allowlist** — add `https://takakori.netlify.app/**` to
   Authentication → URL Configuration. Sign-in works without it, but email
   confirmation and password reset do not.
3. **Free tier pauses** — a free Supabase project pauses after roughly a week of
   inactivity. A paused project means signed-in users see errors rather than an
   empty dashboard. Upgrade, or warn users, before announcing the site.
4. **CI is not running yet** — `.github/workflows/ci.yml` is written but
   unpushed. It needs `gh auth refresh -h github.com -s workflow` first, which
   is interactive. It should run `npm run verify`; E2E needs a browser and a
   signed-in test account, so it stays a local command until a CI secret is set
   up deliberately.

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

The schema already supports transfers; only the UI is missing.

- Transfer form
- Per-account balances (`account_balances` view)
- Account management UI
- Multiple accounts (Cash, bank, bKash, Nagad, card)

## Phase 3 — Polish and reach

- Reports: monthly trend, category breakdown, custom ranges
- Recurring transactions
- Budgets
- Bangla (`bn-BD`) localisation
- Onboarding
- Sentry for production errors

## End-to-end tests ✅

`npm run test:e2e` drives a real browser against the linked development
project — 10 tests, all passing. Credentials come from `.env.test`
(gitignored); see `.env.test.example`.

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
