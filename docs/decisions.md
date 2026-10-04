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
`-4500`. The outer coalesce only rescues the _result_, so it fires precisely when
one side is missing and silently reports zero savings.

Observed in the running app with a single 3,500.50 expense and no income:

| case         | buggy     | correct       |
| ------------ | --------- | ------------- |
| expense only | 0.00      | -3,500.50     |
| income only  | 0.00      | **80,000.00** |
| both         | 75,500.00 | 75,500.00     |

The income-only case is the damaging one: a user with income but no expenses in
the period would see zero savings instead of their full income. The bug is
invisible whenever a period contains both sides, which is why it survived the
seeded-data check in ADR-012 - that fixture had both.

**Consequence:** Any aggregate that combines two independently-nullable inputs
must coalesce each input, not the combined expression. This is also why
JavaScript is a poor model for reasoning about SQL NULL: `null - 3500.5` is
`-3500.5` in JS but NULL in SQL. When checking SQL null behaviour, model the
NULL propagation explicitly rather than translating the expression to JS.

---

## ADR-016 - Recurring transactions predict, they do not auto-post

**Status:** Accepted

**Decision:** A recurring rule stores a schedule. Upcoming occurrences are
predicted and shown as due. Nothing writes a transaction until the user posts
it.

**Reason:** A ledger records what actually happened. Auto-inserting a "salary"
row on the 1st asserts that money arrived even when payment was late or the
amount changed, and the balance is wrong in between. It also makes exactly-once
behaviour genuinely hard: a network retry, a clock skew or a double-tap would
each duplicate a financial record, and there is no natural place to enforce it.

Predict-and-confirm removes the whole class of problem. The user states the
payment happened; only then is a row written.

**Idempotency.** `last_posted_on` is a watermark. Posting advances it with
`or(last_posted_on.is.null, last_posted_on.lt.<date>)`, so a concurrent or
replayed submission matches zero rows rather than writing a second transaction.
Verified: replaying an already-posted occurrence is blocked, a stale watermark
matches zero rows, and a genuinely later occurrence is still allowed. A trigger
also rejects a `last_posted_on` earlier than `anchor_date`, which would otherwise
permanently suppress every future occurrence.

**Consequence:** There is no scheduler dependency - no pg_cron, no external cron,
nothing to keep alive. This matters for the free-tier Netlify target.

---

## ADR-017 - Two partial unique indexes, not one, on budgets

**Status:** Accepted

**Decision:** `budgets_one_overall_per_workspace_idx` (where `category_id is null
and is_active`) plus `budgets_one_per_category_idx` (where `category_id is not
null and is_active`).

**Reason:** NULLs are distinct in a Postgres unique index. A single unique index
on `(workspace_id, category_id)` would permit unlimited overall budgets, because
every NULL compares as different.

**Consequence:** Adding a new "kind" of budget slot needs its own partial index.
The application also surfaces the 23505 error as a readable message, but the
index is what actually enforces it.

---

## ADR-018 - Budget pace counts today inclusively

**Status:** Accepted

**Decision:** Days elapsed is `daysBetween(monthStart, today) + 1`.

**Reason:** On 5 October, five days of the month have been lived through, even
though 5 October minus 1 October is four. Counting exclusively understated the
daily rate by a day and made early-month pace look safer than it was.

**Related bug found by seeded data:** budget spend originally ranged to the end
of the month rather than to today, so a future-dated expense counted as already
spent. On 1 October a single expense dated 3 October read as "?2,500 spent in
one day" and projected ?77,500 against a ?3,000 budget. Spend now runs
month-start to today.

**Consequence:** A budget answers "how am I doing so far", not "what is booked
for this month". Planned future spending belongs in the transactions list.

---

## ADR-019 - A posted occurrence date is validated against the rule

**Status:** Accepted

**Decision:** `postRecurringOccurrence` confirms the requested date is a real
occurrence of that rule before writing anything:

```ts
const expected = nextOccurrence(schedule, occurrenceDate)
if (!expected || expected.date !== occurrenceDate) throw ...
```

**Reason:** The action accepts an occurrence date from the client, and the only
guard at the time was `occurrenceDate > last_posted_on`. That guard is
useless against a forged date, because a large date always satisfies it.

For a monthly rule anchored on the 1st, a client could post `2026-12-25`:

- a transaction was created for a day the rule never predicted
- `last_posted_on` advanced to 2026-12-25
- every genuine occurrence on or before that date became permanently suppressed

One request silently corrupted both the ledger and the schedule. Fixed, with
eight regression tests in `src/lib/occurrence-validation.test.ts` covering
clamped, fortnightly, weekly and ended schedules, plus far-future dates.

**Consequence:** Client-supplied identifiers are never trusted to be
well-formed. A date is data to validate, not a fact to accept.

---

## ADR-020 - Form actions redirect with an error, never throw

**Status:** Accepted

**Decision:** Destructive form actions catch their errors and redirect back to
the page with `?error=<message>`, which the page renders in an alert.

**Reason:** A thrown Error from a Server Action used by a `<form>` becomes a 500
and a full error page. For something as ordinary as deleting a row that was
already gone, that is an alarming response to a routine race. `redirect()` is
called outside the `try` so its control-flow throw is not swallowed.

**Consequence:** Every page that hosts a destructive form reads `searchParams.error`.
The message is user-facing, so query layer errors must not leak schema detail.

---

## ADR-022 - Pending state comes from `useTransition`, never a manual flag

**Status:** Accepted

**Decision:** Client components that drive a `router.push` disable themselves with
`useTransition`'s `isPending`, not with a local `useState` flag they set themselves.

**Reason:** The transaction filter bar disabled its four `<select>`s by calling
`setPending(true)` and then pushing. Nothing ever set it back, so `pending` latched
on after the first filter change and the entire bar stayed `disabled` for the rest
of the page's life. A user could set a period but then never a type or category
without reloading — a silent dead end in a shipped feature that no unit test
covered, because the bug lived in a component nobody was rendering.

`useTransition` ties the flag to the navigation itself: it is true while the
transition runs and clears when the route settles, so there is no second code
path that has to remember to reset it.

**Consequence:** Any new client component that navigates must use a transition for
its pending state. A hand-rolled flag is a latch waiting to happen.

---

## ADR-023 - One definition of "signed in", or the login page deadlocks

**Status:** Accepted

**Decision:** The proxy may redirect `/login` → `/dashboard` only after
`getUser()` confirms the session over the network. `getClaims()` alone is never
enough to move a user away from the login page.

**Reason:** Two layers decide whether a user is signed in, and they used
different tools. `src/lib/supabase/proxy.ts` used `getClaims()`, which verifies
the JWT signature locally against the JWKS. `src/lib/auth.ts` used `getUser()`,
which asks the auth server. A token the auth server rejects — revoked session,
dead refresh token — still passes a local signature check. When the two
disagreed, the production site entered an endless redirect loop: `/login`
redirected to `/dashboard` on the strength of the local check, the dashboard's
own guard failed on the network check, and it redirected straight back. The user
was locked out with no way to sign in and no error to read.

Redirecting away from `/login` is the one place the cheap check is not safe,
because it is the only redirect that can be undone by the other layer. Everywhere
else, failing open towards `/login` is harmless.

**Consequence:** "Cheap local check for speed" is not safe for any decision whose
failure sends the user somewhere another layer will bounce back from. A
regression test asserts that a stale cookie resolves to a login form, though the
revoked-session case itself needs a genuinely revoked token to reproduce and was
not reproducible locally.

---

## ADR-024 - Netlify's build is the CI gate, not GitHub Actions

**Status:** Accepted

**Decision:** The gate lives in the npm `postbuild` hook (typecheck → lint →
test), which runs after every `next build` including Netlify's. `netlify.toml`
sets **no** `command`. No GitHub Actions workflow is used.

**Reason, first half:** Netlify already builds on every push to `main` and
already blocks the deploy when the build fails, so the guarantee a CI workflow
would provide is available without one. This matters because the `workflow`
OAuth scope cannot be granted non-interactively — it needs a browser
device-login, which is exactly the kind of manual step that quietly never
happens. A gate that depends on someone completing a browser dance is a gate that
silently does not run.

**Reason, second half — where this went wrong twice.** The gate has to run
_after_ the build, and both earlier placements were wrong.

`command = "npm run verify"` overrode the build command. `verify` ran typecheck
first, and on a clean checkout that fails with `Cannot find name 'LayoutProps'` —
a type Next 16 generates into `.next/types` during the build. The deploy died at
`tsc` with exit 2, before Next ever ran. The obvious reading, that
`@netlify/plugin-nextjs` objected to the override, was wrong: the plugin was
innocent and the ordering was the bug.

Moving the gate to `prebuild` preserved the same ordering bug and failed
identically. What hid this for months of local work was a stale `.next` left by a
dev server: `LayoutProps` resolved, `tsc` passed, and the project's own
definition of done reported green on a tree that could not build from a clean
checkout. Two failed deploys and a clean clone were needed to see it.

`postbuild` is correct because `next build` generates the types and then
type-checks against them, so by the time the gate runs the types exist. The
plugin is also left to set the build command it expects.

**Consequence:** Check the tree the way a deploy does. `npm run verify` in a
directory with a populated `.next` proves nothing; a clean clone is the only
honest test, and that is now what every deploy does.

**Consequence:** No check on a pull request, only on push; branch previews are
still built and gated, since Netlify builds those too. Running `next build`
directly bypasses the gate, so use `npm run build`. E2E stays out of it: it needs
a browser and a signed-in account, and adding those as CI secrets would widen
the blast radius of a leaked repository for a suite that runs locally in about a
minute.

**Consequence:** `verify` is now an alias for `npm run build`, which is
potentially confusing — the name promises more than the script does. It is kept
because the gate is what people actually mean by "check this".

---

## ADR-025 - One configured origin for every auth redirect URL

**Status:** Accepted

**Decision:** All auth redirect URLs are built from `NEXT_PUBLIC_SITE_URL` via
`src/lib/site-url.ts`. `request.nextUrl.origin`, `VERCEL_URL`, and Netlify's
`URL` are never used for them. A missing value throws in production.

**Reason:** There were two sources of truth. The email flows read the configured
variable; the Google OAuth route built its callback from the incoming Host
header. On Netlify the Host header resolves to the deploy URL, so hitting the
deploy preview silently produced an OAuth callback pointing at
`6abe50ca--takakori.netlify.app` instead of production. Supabase accepted it, the
flow started, and the session cookie would have been set on the wrong host. The
fallback chain was also aimed at the wrong platform: `VERCEL_URL` for a project
that deploys to Netlify, and Netlify's `URL`, which is the deploy URL by design.

A wrong redirect origin is the worst kind of misconfiguration because it does not
look wrong. The URL is well-formed, Supabase returns success, the email is sent,
and the link simply does nothing when clicked. Failing loudly at the point of
misconfiguration is worth an exception page.

**Consequence:** `NEXT_PUBLIC_SITE_URL` becomes a hard requirement for any
deployed environment. That is correct — it is also what the Supabase allowlist is
matched against, so without it no auth flow can work.

---

## ADR-027 — Design tokens as CSS custom properties, not Tailwind palette classes

**Status:** Accepted

**Decision:** Every colour a component can use is a **role** (`surface`, `content`,
`income`, `expense`, `accent`) resolved through CSS custom properties in
`@theme inline`. Dark mode is one block of variable overrides, and no component
contains a `dark:` variant.

**Reason:** Tailwind's palette classes make every colour a decision with no
memory. `text-emerald-700` reads as deliberate and is not: it survives a
rebrand only by being found and replaced one at a time, and it cannot carry
meaning. `text-income` states what the colour _is for_, so the meaning survives
the value changing.

The `dark:` part is the larger win. Roles resolve through variables, so the same
component class is correct in both schemes. A `dark:` variant doubles every
colour decision in the codebase and introduces a class of bug that passes review
and shows up only on a user's phone — the dark-mode half of a card is the half
nobody looks at.

**Consequence:** Adding a colour means adding a role to `globals.css` in both
schemes, not adding a palette class to a component. `src/lib/tone.ts` derives
the six categorical hues from a name so a user-defined category keeps its colour
across screens.

---

## ADR-028 — Bottom tab bar, because this is a phone app

**Status:** Accepted

**Decision:** Primary navigation is a four-item bottom tab bar with a floating
add action. From `md` up it moves into the header. `viewportFit: 'cover'` with
`env(safe-area-inset-bottom)`.

**Reason:** TakaKori is used one-handed, on a metered connection, in a hurry.
Top navigation puts every destination one row deep, which on a 390px screen
means a scrolling or illegible header. The bottom of the screen is where the
thumb already is.

Four tabs is a ceiling, not a starting point: Home, Transactions, Analytics,
Account. Categories, budgets and recurring live under Account, whose job is
"everything about you and your setup". Five or seven tabs is not more
navigable, it is a menu with icons.

The floating add button sits _above_ the bar rather than in it because posting
a transaction is the one thing a user opens the app to do, and burying it in a
row of peers makes it a target they have to aim at.

**Consequence:** A new destination goes under Account, not onto the bar. The
`safe-area-inset` padding is not optional — without it the home indicator sits on
the last row of a list, in exactly the situation the app is designed for.

---

## ADR-026 — Hand-rolled icons and CSS charts, for bundle size

**Status:** Accepted

**Decision:** `src/components/ui/Icon.tsx` is the entire icon set (~30 glyphs,
~2 KB). `src/components/reports/Charts.tsx` is CSS and SVG. Neither has a
dependency.

**Reason:** This app targets users on metered connections. A charting library is
roughly 100 KB of client JavaScript to draw two bar series whose underlying data
is already a table. An icon package is a smaller cost but arrives with its own
bundler assumptions, and the twenty-odd glyphs needed here are twenty-odd
`<path>` elements.

This is a reversible decision with an obvious reversal point: one file each. If
the reports ever need genuine time-series or scatter charts, replace
`Charts.tsx` and the argument no longer holds.

**Consequence:** Adding an icon means drawing it on a 24×24 grid and adding it
to `PATHS`. Adding a chart type goes in `Charts.tsx`. Reaching for a package
first is the wrong instinct in this codebase.

---

## ADR-021 - CSV export pages, and never truncates silently

**Status:** Accepted

**Decision:** Export fetches in 1,000-row pages until a short page proves the
end. If the hard 10,000-row ceiling is reached, a `# WARNING` line is written
into the file itself.

**Reason:** A single `.limit()` produced a file that looked complete but was
missing rows, with no way for the user to tell. Silent truncation in a
data-portability feature is worse than an error: the user believes they have a
complete backup and does not.

Ordering is `occurred_on desc, id desc` because a non-unique sort column makes
row order unstable across pages, which would drop or duplicate rows at a page
boundary.
