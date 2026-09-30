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

1. **Auth pages** — signup, login, logout, email confirmation, password reset
   (auth routes and UI; `proxy.ts` guard already exists)
2. **Google OAuth** — callback route; biggest adoption win for a public audience
3. **Transactions CRUD** — list, create, edit, delete via Server Actions
4. **Accounts CRUD** — already in the schema and seeded at signup
5. **Categories** — seeded; add rename and create
6. **Dashboard** — balance, this month's income/expense/savings from
   `workspace_totals`, recent transactions
7. **Filters and search** — date range, type, category, account
8. **CSV export** — users must be able to get their data out
9. **RLS tests** — two users, cross-tenant denial, against the linked project

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