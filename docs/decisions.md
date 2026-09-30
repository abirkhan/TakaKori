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