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
- [x] **Transactions CRUD** — create, list, delete via Server Actions
- [x] **Accounts CRUD** — create and list; schema already seeded at signup
- [x] **Categories** — create and list; rename still to do
- [x] **Dashboard** — total balance, month income/expense/savings, recent
      transactions, account balances
- [x] **Range-scoped totals** — `workspace_totals_for_range` RPC, since
      `workspace_totals` is lifetime-only and cannot answer "this month"
- [x] **RLS verified live** — two users, cross-tenant read/update/delete denied,
      7 row-shape invariants rejected, reconciliation checked
- [ ] **Edit transaction** — action exists; no UI yet
- [ ] **Filters and search** — date range, type, category, account
- [ ] **CSV export** — users must be able to get their data out
- [ ] **Google OAuth** — biggest adoption win for a public audience
- [ ] **Browser verification** — blocked on `.env.local`

### Blocked

`.env.local` does not exist, so the app has never been loaded in a browser.
Everything below is verified by build, tests, and live-database probes; nothing
is verified through the UI yet.

Required to unblock:

1. Copy `.env.example` to `.env.local` with the project URL and publishable key
2. `NEXT_PUBLIC_SITE_URL` must match a Supabase Redirect URL exactly
3. Set the Site URL in the Supabase dashboard to the same value
4. `npm run dev`, then sign up and add a transaction

Charts come after the data is trustworthy. A chart of a wrong number is worse
than no chart.

## Phase 2 — Accounts and transfers

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