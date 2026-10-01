# Decisions

Architectural decision log. Append new entries; do not edit accepted ones.
Supersede rather than rewrite, so the history stays readable.

---

## ADR-001 — Supabase Postgres as the primary store

**Status:** Accepted

**Decision:** Supabase (managed Postgres + Auth + RLS) for database and auth.
Netlify for hosting.

**Reason:** Postgres gives exact numeric arithmetic, CHECK constraints, and RLS
enforcing authorization at the data layer. Next.js has first-class Supabase
support via `@supabase/ssr`, and Netlify supports App Router, SSR, Server
Actions and middleware through its OpenNext adapter.

**Consequence:** Authorization is the database's job. Application code never
decides who may see a row.

---

## ADR-002 — `workspace_id` as the only tenancy key

**Status:** Accepted

**Decision:** Every user-owned table carries `workspace_id`. Business tables do
**not** carry `user_id`; ownership derives through `workspace_members`.

**Reason:** An earlier draft had both `user_id` and `account_id` on
`transactions`. Both are independently updatable, so they can drift: a
transaction can end up pointing at an account that belongs to someone else.
Foreign keys do not catch this because each column is individually valid.

With a single tenancy key that state is not representable.

**Consequence:** Shared and family workspaces need no schema change — only a new
row in `workspace_members`. A unique index currently caps users at one
workspace; dropping it is the whole migration.

---

## ADR-003 — RLS wraps `auth.uid()` in a subquery

**Status:** Accepted

**Decision:** Every policy uses `(select auth.uid())`, never a bare
`auth.uid()`.

**Reason:** Bare `auth.uid()` is evaluated once per row. Wrapped in a subquery
Postgres hoists it to a single InitPlan evaluated once per query. On a large
table this is a 5–100× difference. It is also the pattern in Supabase's own
documentation.

**Consequence:** This looks like noise. It is not. A future cleanup that removes
the parens is a performance regression, not a simplification.

---

## ADR-004 — `numeric(14,2)` for money, with a typed JS boundary

**Status:** Accepted

**Decision:** Money is `numeric(14,2)` in Postgres and integer minor units in
TypeScript. All conversion lives in `src/lib/money.ts`; all aggregation lives in
SQL.

**Reason:** `numeric` is exact and crosses PostgREST as a **string**
(`"3500.00"`). JavaScript floats cannot represent `0.1` exactly. Hand-written
arithmetic on the raw value produces `"3500.00100"` or
`0.30000000000000004`, silently.

**Consequence:** No module other than `lib/money.ts` may convert or sum money.
Dashboard totals come from `workspace_totals`, not from summing in a component.

---

## ADR-005 — Transfers are a transaction `type`, not a category

**Status:** Accepted

**Decision:** `type` is `income | expense | transfer`. Transfers carry a
`counterparty_account_id` and no category, enforced by a CHECK constraint.

**Reason:** Moving money between two of your own accounts is neither income nor
spending. Treating it as a category inflates both totals — the single most
common accounting bug in personal finance apps.

This was originally deferred to a later phase. Deferring it would have required
rewriting every balance query, view, and report once transfers shipped, so the
data model absorbs it now at the cost of one nullable column.

**Consequence:** `workspace_totals` excludes transfers by construction.
`account_balances` applies them in both directions.

---

## ADR-006 — `occurred_on` is a `date`, ranges computed in the user's timezone

**Status:** Accepted

**Decision:** `occurred_on` is a plain `date`. `profiles.timezone` stores an
IANA zone. `src/lib/dates.ts` resolves presets against that zone.

**Reason:** An instant stored as `timestamptz` makes "today" depend on the
server's clock. A user in Dhaka (UTC+6) recording an expense at 00:30 local
would see it filed on the previous day if the server computed month boundaries in
UTC. The same breaks for India (UTC+5:30) and any US timezone.

**Consequence:** Never derive a reporting range with `toISOString()` or
`new Date().getMonth()`.

---

## ADR-007 — `proxy.ts`, not `middleware.ts`

**Status:** Accepted

**Decision:** Session refresh lives in `src/proxy.ts`.

**Reason:** Next.js 16 renamed `middleware.ts` to `proxy.ts`. The old filename is
silently ignored — no error, no warning, sessions simply never refresh, and
users are logged out at random. This is the highest-risk drift point for an AI
agent working from stale training data.

**Consequence:** `proxy.ts` exports `proxy(request: NextRequest)`. It is a
redirect convenience only; authorization is re-checked in every Server Action.

---

## ADR-008 — Lint runs as its own step

**Status:** Accepted

**Decision:** `npm run verify` runs `typecheck → lint → test → build` as
separate steps.

**Reason:** Next.js 16 removed `next lint`, and `next build` no longer lints.
A definition of done that relies on the build to catch lint errors silently
stops catching them.

---

## ADR-009 — BDT display uses `bn-BD` with Latin digits

**Status:** Accepted

**Decision:** `formatMinor` formats with `bn-BD` and `numberingSystem: 'latn'`,
then prefixes the currency symbol from a lookup table.

**Reason:** `en-BD` looks correct but Node's ICU has no BDT symbol for it, so
Intl silently falls back to `en` and renders `"BDT 125,000.00"` — Western
grouping and no taka sign. `bn-BD` has the symbol and lakh grouping but defaults
to Bengali digits (১,২৫,০০০). Pinning Latin digits produces the intended
`৳ 1,25,000.00`.

Verified in `src/lib/money.test.ts`.

---

## ADR-010 — TypeScript pinned below 7

**Status:** Accepted

**Decision:** `"typescript": "~5.9.3"`.

**Reason:** npm's `latest` tag is now 7.0, the Go-based compiler. It is a large
change and the Next.js and ESLint integrations here have not been validated
against it.

**Consequence:** Revisit when Next.js and `eslint-config-next` declare TS 7
support. Upgrade deliberately, not via `npm update`.

---

## ADR-011 — `en-BD` locale data cannot be trusted for currency

**Status:** Accepted

**Decision:** Never use `Intl.NumberFormat` with `style: 'currency'` for BDT.
Use `formatMinor`.

**Reason:** The fallback behaviour is silent and locale-dependent. A build
machine with different ICU data could produce different output from a user's
browser, and nothing would signal a problem. Explicit formatting is
deterministic.

**Consequence:** Test any new display helper against the exact expected string.
A test that checks "contains the symbol" would pass under `en` fallback and miss
the grouping bug.
---

## ADR-012 - Database views are verified against seeded data, not by inspection

**Status:** Accepted

**Decision:** Every view is exercised with realistic data before it is trusted,
and a reconciliation invariant is asserted.

**Reason:** `account_balances` shipped with a defect that no amount of reading
would have caught. The view attributed income in the same UNION branch as
transfer inflows, selecting `counterparty_account_id as account_id`. Income rows
have `counterparty_account_id = NULL`, so every income row was assigned to a NULL
account and vanished from the LEFT JOIN.

With income 80,000 and expenses totalling 5,499, Cash reported **-10,499**
instead of **69,501**. The view compiled, returned rows, and looked entirely
plausible. Only seeding real data exposed it.

**The reconciliation invariant**, worth re-asserting after any change to these
views:

    sum(account_balances.balance) == lifetime(total_income) - lifetime(total_expense)

It holds because transfers move value between accounts and net to zero. Any
accounting view that violates it is wrong, even if every individual number looks
plausible.

**Consequence:** A view is not done until it has been run against data with
income, expense, transfer, and multi-account movement.

---

## ADR-013 - CHECK constraints cannot contain subqueries

**Status:** Accepted

**Decision:** `profiles.timezone` is validated by a trigger, not a CHECK
constraint.

**Reason:** The original migration used
`check (timezone = any (select name from pg_timezone_names))`. PostgreSQL rejects
this outright - subqueries are not permitted in CHECK - and the migration failed
to apply with `0A000: cannot use subquery in check constraint`. `pg_timezone_names`
is a view, so it cannot be referenced from a CHECK at all.

**Consequence:** `public.validate_timezone()` runs BEFORE INSERT OR UPDATE and
raises `check_violation`. Reach for a trigger, not a CHECK, whenever validation
needs to consult another relation.

---

## ADR-014 - Auth confirmation works without dashboard configuration

**Status:** Accepted

**Decision:** Email confirmation redirects to `/auth/callback`, a Client
Component that exchanges the URL-fragment token via `supabase.auth.getSession()`.

**Reason:** Supabase supports two flows. The token_hash flow is more robust -
a Route Handler sets cookies server-side - but it requires editing the "Confirm
signup" email template in the dashboard to send
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. That is an
easy step to miss, and when it is missed email confirmation silently breaks for
every new user.

The fragment flow works with the default template and no dashboard changes.

**Consequence:** `src/app/auth/confirm/route.ts` implements the token_hash flow
and can be enabled later by changing one email template and one redirect URL.
Do not delete it.

---

## ADR-015 - COALESCE each side of a subtraction, never the whole expression

**Status:** Accepted

**Decision:** `net_balance` is computed as

    coalesce(sum(amount) filter (where type = 'income'), 0)
  - coalesce(sum(amount) filter (where type = 'expense'), 0)

never as `coalesce(sum(income) - sum(expense), 0)`.

**Reason:** A filtered `SUM` with no matching rows returns NULL, and in SQL NULL
propagates through arithmetic. `coalesce(NULL - 4500, 0)` is therefore `0`, not
`-4500`. The outer coalesce only rescues the *result*, so it fires precisely when
one side is missing and silently reports zero savings.

Observed in the running app with a single 3,500.50 expense and no income:

| case | buggy | correct |
|---|---|---|
| expense only | 0.00 | -3,500.50 |
| income only | 0.00 | **80,000.00** |
| both | 75,500.00 | 75,500.00 |

The income-only case is the damaging one: a user with income but no expenses in
the period would see zero savings instead of their full income. The bug is
invisible whenever a period contains both sides, which is why it survived the
seeded-data check in ADR-012 - that fixture had both.

**Consequence:** Any aggregate that combines two independently-nullable inputs
must coalesce each input, not the combined expression. This is also why
JavaScript is a poor model for reasoning about SQL NULL: `null - 3500.5` is
`-3500.5` in JS but NULL in SQL. When checking SQL null behaviour, model the
NULL propagation explicitly rather than translating the expression to JS.
