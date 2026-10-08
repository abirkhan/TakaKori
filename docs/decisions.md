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

## ADR-029 - No field under 16px, and no horizontal overflow

**Status:** Accepted

**Decision:** No `input`, `select` or `textarea` may compute under `16px`
font-size, including visually hidden ones. `documentElement.scrollWidth` must
equal `clientWidth` on every route. Zoom is pinned at 1 in the viewport export.
Enforced by `e2e/layout.spec.ts` at 320/360/390/412px.

**Reason:** This app shipped a layout that was correct at every width in a
desktop browser and unusable on the phone it is actually used on. Four
independent causes, each invisible in code review:

1. **iOS auto-zoom.** Safari zooms the _page_ on focus of any field under 16px
   and never zooms back out. The permanent result is a zoomed viewport: the
   fixed tab bar is sized against the visual viewport rather than the layout
   one, so it sits over the content, and a 390px layout is read at ~300px. It
   presents as a broken bottom nav, which sends you looking at the nav.
2. **A grid track with no explicit column.** The implicit track is `auto`,
   floored at its content's min-content width. A transaction row's min-content
   is ~430px — the amount is `nowrap` and the title is truncating — so a 390px
   phone got a 459px-wide page.
3. **`sr-only` inside a scroll container.** `sr-only` is `position: absolute`.
   With no positioned ancestor its containing block is the _viewport_, so the
   hidden radios landed past the right edge and widened the document even though
   the segment scrolled correctly. This is the subtlest of the four: the control
   under test was behaving properly and the invisible input was the cause.
4. **Nested flex rows.** `RowLink` rendered a `.tk-row` inside a `.tk-row`. The
   inner flex container inherited `min-width: auto`, which floors it at its own
   min-content, so it could not shrink to fit its parent.

Cause 3 is the argument for a test rather than a review checklist: no amount of
reading `SegmentedControl` would have surfaced it, and it only appears at widths
narrower than the window it was built in.

**On disabling zoom:** `maximumScale: 1` is set, but Safari has ignored
`user-scalable=no` since iOS 10, so it changes nothing there — it only controls
double-tap zoom and Android/Chrome. Field size is the only thing that actually
prevents the iOS behaviour. Disabling pinch-zoom is a WCAG 1.4.4 failure,
accepted here because a zoomed state of this layout is genuinely unusable and no
content benefits from zooming; it should be revisited if the app gains
long-form reading or a data table.

**Consequence:** Adding a field means checking its computed font-size, not its
eyeballed one. Adding a list means checking it at 320px, not at the width of the
window it was built in. Both are now assertions rather than habits.

---

## ADR-030 - Create forms are sheets on native `<dialog>`, state in the URL

**Status:** Accepted

**Decision:** On a tab screen, a create form is a modal sheet and the list owns
the screen. Sheets are built on `<dialog>` + `showModal()`. Sheet state is
`?sheet=<name>` in the URL, not React state. Form fields are controlled, held in
a component mounted only while the sheet is open. A row carries one action
target, not two visible ones.

**Reason:** Each clause exists because the alternative shipped a specific defect.

**The create form.** `/transactions` is the second tab. A user tapping it to
_see_ their spending was met by a six-field form occupying the entire first
screenful — the screen's most-used list was unreachable without scrolling past
the tool for using it. `/accounts` had the same shape, which made one screen
promise balances, a create form, and navigation to every settings page while its
tab label promised one thing.

**`<dialog>`.** The things a modal must get right are behaviours, not styles:
focus trapped and moved in, Escape to close, the page behind inert, and rendering
above every `z-index` including the fixed tab bar. Reimplementing them is how
modals look correct in a screenshot and are unusable with a keyboard. One
consequence: never declare `display` on the dialog unconditionally — it overrides
the UA's `dialog:not([open]) { display: none }`, and a closed sheet stays painted
and keeps swallowing clicks. Scope it to `[open]`.

**The URL.** Because the state is in the query string, the trigger can be a real
`<Link>` that works before hydration, and the back button closes the sheet — which
is what a user pressing back on a modal expects, and what almost no hand-rolled
modal gets right. Closing _replaces_ rather than pushes, so dismissing does not
leave an entry to press back through twice.

**Controlled fields.** React resets an uncontrolled `<form>` when its action
resolves, _including when the action fails_. So a server validation error wiped
every field the user had filled in and left them retyping the form beside the
message explaining what they got wrong. Holding the draft in a child that mounts
only while the sheet is open makes remounting _be_ the reset — which avoids both
a reset effect and a `setState` inside one.

**One action target.** A row with visible Edit and Delete links carries two 44px
hitboxes and runs ~40% taller, on every row of a fifty-row list, for actions a
user runs rarely, with a mis-tap sitting in a list of financial records. A single
`⋯` opens a two-option sheet; Delete then sits behind two deliberate taps, which is
the right friction for something with no undo.

**Consequence:** A new tab screen lists first and creates in a sheet. A new
per-row action goes in `RowActionsSheet`, not on the row. Sheet behaviour is
covered by `e2e/sheets.spec.ts`, including the inertness, Escape, back-button and
closed-sheet-paints-nothing cases that a "let's hand-roll it lighter" change would
otherwise regress silently.

---

## ADR-031 - Nav height and main clearance are one declaration

**Status:** Accepted

**Decision:** `--nav-height` and `--nav-clear` are declared together in
`globals.css`; the tab bar is sized from `--nav-height` and `main`'s bottom
padding is `var(--nav-clear)`.

**Reason:** They were a literal `pb-32` (128px) and an implicit ~77px, and
nothing in review could compare them. A measurement on a 390×844 screen found
**113 focusable elements whose centre sat under the bar** — including the
transaction form's own save button, which is how a form whose primary action was
invisible got missed for as long as it did.

Two numbers that must agree should be one declaration. The floating action moved
to the bar's right edge at the same time: centred, it straddled the "Transactions"
and "Analytics" labels and sat on top of two other targets.

**Consequence:** Changing the bar's height changes its clearance automatically.
A new screen does not compute bottom padding by hand.

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

---

## ADR-032 — Posting an occurrence is a database function, not application code

**Status:** Accepted

**Decision:** `public.post_recurring_occurrence(target_recurring_id uuid,
occurrence_date date) returns uuid`, `SECURITY INVOKER`, granted to
`authenticated`. The row lock, the schedule validation, the insert and the
watermark advance are one call. The TypeScript that did this is deleted.

**Reason:** ADR-019 established that a client-supplied occurrence date must be
checked against the rule's real schedule. Without it, one request could post
2026-12-25 to a monthly rule anchored on the 1st: a transaction for a day the
rule never predicted, _and_ `last_posted_on` advanced past every genuine
occurrence, permanently suppressing them. That check lived in application code,
which is correct only while the application code is not shipped to the client.

It is now shipped to the client. `postRecurringOccurrence` is called from a
Client Component, so whatever validates the date is whatever the user edits.
`SECURITY INVOKER` is the important half: RLS still decides what the caller may
touch, so this is not a privileged bypass. What moves is only the arithmetic the
caller is not entitled to change.

**Consequence:** The schedule walk now has two implementations —
`src/lib/recurrence.ts` for prediction, this function for validation. They must
agree, and nothing in `npm run verify` compares them.

That gap was not hypothetical. The first version of `private.recurring_add`
handled `daily` and `weekly` and let `yearly` fall through to the month-shifting
branch, so a yearly rule advanced one **month** per step. A rule anchored on
29 February resolved to 2025-01-29 where TypeScript resolved 2025-02-28. All 147
unit tests passed throughout, because the TypeScript was correct and the bug was
in code the tests no longer covered.

It was found by `npm run parity`, which runs sixteen cases through both
implementations, and by `supabase/tests/post_recurring_occurrence.sql`, which
asserts the same matrix against SQL plus the idempotency and watermark
behaviour. **A second implementation of anything financial needs a parity check,
and the check is part of the change, not a follow-up.**

Two behaviours improved as a side effect. `FOR UPDATE` removes the window the old
watermark guard left open, where the insert had been attempted before anything
stopped a concurrent duplicate — that state was reachable, which is why the old
code had a message for it. And insert plus watermark advance are now atomic;
previously a failure between them left a transaction with nothing recording it.

---

## ADR-033 — PWA icons are generated from one SVG, not exported per size

**Status:** Accepted

**Decision:** `public/icon.svg` is the only artwork. `scripts/generate-icons.ts`
rasterises it into 18 files via sharp, run with `npm run icons`. Nothing
hand-exports an icon.

**Reason:** Three platforms ask for an icon by a different name at a different
size, and each has a constraint the others do not:

- Android crops a **maskable** icon to whatever shape the OEM uses, so the
  background must be full-bleed and the artwork inset to the safe zone. The safe
  zone is a _circle_, so a square has to be smaller than 80% to fit: at 0.8 that
  is `s <= 0.566`. The script uses 0.55.
- iOS masks `apple-touch-icon` into its own squircle and renders transparency as
  **black**, so a transparent-cornered icon gets black corners. With no icon at
  all, iOS 16.4+ draws a monogram of the site's first letter.
- Chromium picks the icon nearest the size it wants for the Android splash
  screen, and `sizes: "any"` gives it nothing to match against.

A hand-exported set drifts: someone nudges `icon.svg` and the 512 PNG keeps the
old mark until somebody notices on a home screen.

**Consequence:** Changing the logo means changing `public/icon.svg` and running
`npm run icons`. The generated files are committed, because nothing generates
them on CI. Startup images additionally require one `<link>` per device, and the
matrix is written to `startup-images.json` by the same script that renders them
— iOS silently ignores a mismatched media query, so a file without a link and a
link without a file both fail with no error at all.

There is deliberately **no `monochrome` icon**, for a reason rather than an
oversight: the mark is two overlapping bars and a wallet, and flattened to a
single colour they merge into an unreadable blob. There is no notification badge
in this app to need one.

---

## ADR-034 — The install prompt adapts to the platform, because two of them will not ask

**Status:** Accepted

**Decision:** One module, `components/app/InstallPrompt.tsx`, holding one
`useSyncExternalStore` snapshot of what the browser supports. It renders two
ways: `InstallBanner` asks once inside the signed-in shell, and `InstallRow`
lives permanently under Account. Chromium installs in one tap; iOS and Safari get
instructions; Firefox gets nothing.

**Reason:** No version of iOS fires `beforeinstallprompt` or exposes an install
API. The only route is the user performing a gesture in the Share sheet, so a
button saying "Install" on an iPhone could only ever open instructions. Saying
"how" is the honest label.

Chromium delays the event behind engagement heuristics — HTTPS, at least one
interaction, and at least 30 seconds on the site. So the event can legitimately
never arrive while DevTools reports the app installable the whole time. Binding a
button to an event that may not fire ships a dead control, which is why the label
changes when there is no event to call.

**Consequence:** Dismissal is permanent, not per-session. A prompt that reappears
is worse than none: it turns a one-time interruption into a recurring tax on
opening the app. The Account row is the way back, so nothing is taken away, only
the nagging.

Installability is separate from offline, and it is worth not confusing them. The
banner is not in the browser's gift: Chrome supplies a default offline page for
an installed app with no service worker, and this app's audience is on metered
connections. See ADR-035 for the other half.

---

## ADR-035 — `useOffline` is a connectivity signal, and is not offline support

**Status:** Accepted

**Decision:** `experimental.useOffline` is enabled, and
`components/app/OfflineBanner.tsx` uses `useOffline()`. Genuine offline reads are
not implemented, and the flag is not treated as if they were.

**Reason:** The name oversells it, and the two things it does are worth separating.
It exposes `useOffline()`, which is better than `navigator.onLine` — that reports
the OS network interface and still says `true` for a phone on a WiFi with no
upstream internet. And a navigation, prefetch or Server Action that fails offline
stays pending and is retried, rather than rejecting into an error page.

What it is not is a cache. Its own documentation says a full page reload while
offline still fails because the browser needs the network to deliver the document,
and that full offline loads need a service worker. It also does not touch requests
the app issues itself — every data read goes through `supabase-js`, not `fetch`,
so it is outside the framework's retry entirely.

**Consequence:** A green banner in the UI is not evidence that offline works. The
banner's copy says "figures on screen are from the last time this device synced",
which is a promise the offline work still has to keep: `lib/client/cache.ts`
stores the last value the _database_ produced and its timestamp, and screens must
render that timestamp, because every aggregate in this app is a SQL view or RPC
(ADR-004) and therefore cannot be recomputed offline.

Which is why the offline model is a timestamped snapshot and **not** a local
recomputation. Mirroring `account_balances` in JavaScript would mean a second
implementation of the money logic, and ADR-012 is a record of what a plausible
wrong balance looks like from the outside.

---

## ADR-036 — Google OAuth runs in the browser, and ADR-025 stops being a hazard

**Status:** Accepted. **Supersedes ADR-025.**

**Decision:** `auth/login/google` and `auth/callback/google` are deleted. The
flow is started by `components/app/GoogleSignIn.tsx` and completed by a **page**
at `/auth/callback/google`, both client-side, using `flowType: 'pkce'` with
`detectSessionInUrl: true`. `redirectTo` is
`${window.location.origin}/auth/callback/google`.

`auth/signout` is **kept**, deliberately — see the consequence.

**Reason:** ADR-025 existed because the OAuth handler built its callback from
`request.nextUrl.origin`, which on Netlify resolves to the _deploy_ URL. Hitting
a deploy preview therefore sent its OAuth callback to production. Supabase
accepted it, the flow started, and the session cookie was set on the wrong host —
a misconfiguration with no visible symptom.

A browser-side flow removes the origin question rather than fixing it. There is no
server to derive an origin from; the redirect target is whatever host the user is
on. A deploy preview now sends its own URL, Supabase compares it against the
allowlist, and **rejects it loudly**. The failure moved from silent to obvious,
which is the whole improvement.

The two handlers also had a reason that no longer applies: they existed so the
server client could write the PKCE verifier to a cookie the callback could read.
`@supabase/ssr`'s browser client keeps the verifier in `document.cookie` — the
same storage as the session itself — so the exchange needs no server and an
installed PWA behaves identically to a browser tab.

**Consequence:** A real Google round-trip has **not** been run. It needs live
Google credentials and an interactive consent screen, so this is verified by
types, by build, and by loading the callback page — not by completing a sign-in.
Deploy previews each need a Supabase allowlist entry with the branch name in it,
which `netlify.toml` already documents and which was previously a live production
risk rather than a setup step.

`auth/signout` stays because the dashboard's sign-out must work with JavaScript
unavailable, on a metered connection, in an installed PWA that has been
backgrounded. `SignOutButton` keeps the form posting to a Server Action and
_upgrades_ it after hydration rather than replacing it.

That upgrade is not decoration, and it is why this ADR sits alongside the client
data layer. `clientContext()` memoises `workspaceId` for the life of the tab,
and `lib/client/cache.ts` holds balances in memory and in IndexedDB. A Server
Action can clear neither. Without the client path, signing out and back in on a
shared device shows the previous user's balances — the exact failure the
memoisation was built to make fast, and one that no test in this repository
caught.

---

## ADR-037 - A write returns a result, so the cache can hear about it

**Status:** Accepted. **Supersedes ADR-020.**

**Decision:** Every mutating Server Action returns `ActionState`
(`{ error?, success?, fieldErrors? }`). None of them calls `redirect()` except
the two auth actions, where navigation _is_ the outcome. `ConfirmDeleteSheet` and
the new `components/mutations/WriteForm` both drive these with `useActionState`
and call `useWriteInvalidation(state.success, kind)`.

**Reason:** ADR-020's reasoning was right and its mechanism was not. It said a
form action must not throw, because a thrown `Error` becomes a 500 and an error
page - a poor outcome for deleting a row that was already gone. So it redirected
with `?error=` instead. Two things were wrong with that, and both only became
visible once data moved into the browser.

**The `?error=` was read by nobody.** No page in this app accepts `searchParams`.
Six actions were writing a message into a URL that no component looked at, so a
failed delete navigated the user back to a perfectly clean page and said nothing
at all. This was not a regression from the client-data move - it had been true
since ADR-020. It just never mattered as much while the redirect itself was the
visible outcome.

**A redirect cannot invalidate a browser-side cache.** It is a server-to-browser
navigation; the paths it revalidates are never re-fetched. A delete would write
its row, revalidate three routes, and leave the dashboard showing the balance
from before it - ADR-012's failure reached through a delete rather than an edit.

`success` is the signal that fixes the second problem, and `error` is the signal
that fixes the first. Neither is decoration; both were already being computed and
thrown into a query string.

**Consequence:** `useWriteInvalidation` is a bridge, not the destination. It
exists because the mutation still runs on the server and the cache still lives in
the browser, so something has to carry the news across. Phase 2 removes the
crossing by moving the mutation into the client, at which point `applyWrite` is
called by the mutation itself and this hook has no job. It is wired into eleven
call sites today and all eleven will be deleted together, not one at a time.

`ConfirmDeleteSheet` still submits as a plain `<form action={...}>`, so deleting
works with JavaScript unavailable. What degrades without JS is the _message_:
React renders the returned state only on the client. That is a smaller loss than
what it replaced, which showed nothing at all in every case.

## ADR-039 - "Keep me signed in" is a cookie lifetime applied on every write

A Supabase session is two cookies, and `@supabase/ssr` writes them with whatever
lifetime auth-js hands it — which means a **session cookie**, gone when the browser
closes. That is right for a shared machine and wrong for a phone.

### The naive version breaks silently, an hour in

Stamping a 30-day expiry at sign-in looks like it works. Then auth-js refreshes the
token, rewrites the cookie with the default short lifetime, and "remember me"
quietly stops remembering — for most users, with nothing in the logs and nothing on
screen. A feature that fails an hour after it is introduced, only sometimes, is
worse than one that was never offered.

So the preference lives in its own cookie (`tk.remember`) and is applied on **every**
write, including refreshes. That is why `proxy.ts` takes part even though sign-in
happens in a Server Action: the refresh is the only place the lifetime is decided
again, so it is the only place that can keep the promise.

### "Not remembering" has to remove the expiry, not shorten it

auth-js supplies `expires` alongside `maxAge` for the access token, and a cookie
with a future `expires` is persistent whatever its `maxAge` says. Stripping only
`maxAge` leaves an unchecked box still keeping people signed in. `withRemember`
deletes both keys.

### Two sign-in paths, one preference

The Google flow runs entirely in the browser (ADR-036) and never touches the
server's cookie writer, so `GoogleSignIn` writes `tk.remember` itself before
redirecting. Leaving the checkbox uncontrolled would have let the two paths
disagree — tick the box, sign in with Google, get a session cookie anyway — which
is why `SignInForm` holds it in state and passes it down.

The Google path is **best-effort**: the browser Supabase client writes its own
session cookie with `document.cookie` and nothing can add a lifetime to that
particular write. It is corrected on the proxy's next rewrite, which is the first
server-rendered request after the callback. Password sign-in is reliable.

`tk.remember` is deliberately **not** `httpOnly`. It holds no secret — `"1"` or
`"0"` — and the OAuth path has to be able to write it. The session cookies stay
`httpOnly`; auth-js does that and this module does not touch it.

### Defaulting to checked

A finance app defaulting to _not_ remembering is the more usual call, and this is
the one place that choice was made the other way: this is a personal tracker that
people install to their own phone and use on a metered connection, where being
signed out every few days is a real and repeated cost. It is one line to flip in
`SignInForm`, and it is flagged here because it is a judgement rather than a fact.

## ADR-040 - The header carries four destinations; the rest live behind one control

The desktop header listed all seven destinations flat. That is a menu, not
navigation: at 360px it wraps, and it treats a screen checked weekly the same as one
tidied twice a year.

Two changes, and only two:

**Four pills, and one overflow control.** The header now carries the same four as
the tab bar — Home, Transactions, Analytics, Account — so a destination is in the
same place on every screen size rather than moving at `md`. The three maintenance
destinations move into a sheet opened by a single control.

**That control shows at every width, including below `md`.** It looks redundant
beside a bottom tab bar carrying the same four, and it is the point: on a phone
those three screens were reachable _only_ by scrolling to Account and finding them
there, which made the tab bar look like the whole application. One button puts them
a tap away without adding a fifth tab, which the four-tab ceiling rules out.

### The order is the decision

The overflow lists **Budgets, Recurring, Categories**:

1. **Budgets** — a limit is set once and checked against often. "Am I over?" is the
   reason to open it.
2. **Recurring** — salary and subscriptions; consulted when something looks wrong
   or is due to change.
3. **Categories** — the vocabulary, corrected when it stops matching reality. Rare
   by design.

It was alphabetical-ish, which is not an ordering. `layout.spec.ts` asserts the
sequence, because a ranking that is only argued for in a comment will drift.

### What was tried and rejected

A sticky bar that condensed on scroll. It measured correctly — the bar's height was
identical in both states, so nothing below it moved — and it was still wrong: it put
a navigation bar over the content while someone was halfway down a fifty-row
transaction list. The bar scrolls away with the page, as it always did.
`AppHeader` and its scroll listener were deleted rather than left disabled, and the
two tests that covered them went with them.

## ADR-038 - Write feedback is a toast, except where a modal is open

Every write in this app was silent. Add an expense and the sheet closed; delete a
row and it went away. For most software that is merely terse. For a ledger it is a
hazard: a save that fails and a save that lands look identical, so the user's only
way to find out is to go looking.

The first implementation was a banner in normal flow above the content — never
`fixed`, permanent, dismissed by hand. That was wrong on the second count. A
confirmation that never leaves pushes the content down to make room for a sentence
about something that has already succeeded, and it does that on every screen. So
the default is now a **toast**: fixed above the tab bar, auto-dismissed.

What stops the toast from becoming the failure mode it looks like:

| Hazard                                          | Answer                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Message expires unread                          | Pauses while hovered **or** focused; grants full time again                  |
| Cannot outrun the reader                        | A close button, so it is never purely time-dependent                         |
| User misses the only record that a write failed | Errors live twice as long as successes (`DURATION`)                          |
| Two writes in quick succession                  | The second replaces the first; never a stack or a queue                      |
| Announcement lands on a node appearing          | The live region is always mounted; the message is injected into it           |
| Screen reader interrupted on success            | The region is `role="status"` (polite); only an error carries `role="alert"` |

The **one** place this does not apply, and the reason is physical rather than
stylistic: **a toast is behind a modal backdrop.** `AddTransactionSheet`,
`EditTransactionSheet` and `ConfirmDeleteSheet` all stay open when a write is
rejected, so that the message can be read beside the field that caused it — and a
`z-index: 50` toast is not on screen while they are. Those errors therefore stay
inline inside the sheet. Toasting them would be strictly worse than the bug ADR-037
was written to fix, which was a failed delete returning to a clean page and saying
nothing.

Two further decisions inside it:

- **A store, not context.** Same reasoning as `useInstall`: the writes that need
  reporting are Server Actions fired from forms, sheets and buttons across five
  screens, several through portals. A store needs no provider and no call-site
  wrapping, so a write cannot fail to announce itself because someone forgot to
  put a component above it.
- **The layer is `pointer-events: none`; only the toast is not.** The layer spans
  the screen so it can centre the toast, and without this it would swallow every
  tap aimed at the rows underneath — on the Transactions screen, the list the user
  had just written to.

`sheets.spec.ts`'s "a rejected save keeps the sheet open with the input intact" is
the test that pins the exception, and `flows.spec.ts` pins the rest: that a
confirmation appears, is polite, goes away on its own, and does not intercept taps.

## ADR-041 - The deadline lives in the component, because React owns the result

**Context.** Verified in a browser with the network severed: submitting a
transaction offline left the sheet's button reading "Saving…" and disabled
indefinitely. No error, no toast, nothing in the `outbox` store, still stuck past
fifteen seconds. Every `useActionState` form in the app behaved this way —
sign-in, sign-up, forgot-password, and all seven data forms. A person on a bad
connection who tapped "Sign in" got a dead button and no explanation, which is the
worst possible first impression on a ledger.

**The finding that shaped this.** The Server Action's promise **never settles** when
the request dies below the RSC layer. It does not resolve and it does not reject —
it is not a failure, it is an absence. So `useActionState`'s `isPending` has
nothing to resolve with and nothing to reject with.

**Decision.** `useWriteAction` in `src/lib/client/useWriteAction.ts`. It returns
the same `[state, dispatch, pending]` triple as `useActionState`, so each of the
eleven call sites swapped one line and rendered nothing new — every form already
renders `state.error`. Two differences:

- `pending` is `reactPending && !localError`, so the button comes back.
- `state` is replaced with an error when the write was blocked or given up on,
  because React will never produce one.

It also **refuses to dispatch while offline**. The action is not sent at all, so
nothing is written and a retry cannot produce a duplicate entry. `offline` comes
from `useOffline()`, for the reason ADR-036-era `OfflineBanner` already documents:
`navigator.onLine` reports the network interface and stays `true` on a phone on a
WiFi with no upstream — which is exactly the case that needs telling.

**What was tried first and does not work, recorded so nobody tries it again.** The
natural fix is to wrap the action: race it against a timer and return an error when
the deadline passes. That was built, tested, and shipped to a real browser. The
timer fired, the wrapper returned — and React discarded the value.

The reason is specific and worth keeping. React does not take the result from the
promise the action returned once a Server Action has been dispatched; it takes it
from the server round-trip. The same wrapper, returning *immediately* without
dispatching anything, was picked up and rendered within 530ms. Dispatching is
precisely what costs us the return value. **A deadline cannot be enforced from
inside the action**, which is why this is a hook and not a wrapper.

**Consequence.** A timed-out write is reported as "we could not confirm it saved",
never as "that did not save", because the write may still be applied — which it did,
during the session this was written after. For a ledger, an entry appearing twice
is worse than one that takes an extra moment to acknowledge itself, and only the
user can tell the difference. The blocked message says outright that nothing was
saved, because in that path it is true.

`OfflineBanner`'s copy changed to match. It promised "anything you save will wait
for a connection", and nothing queues — the `outbox` store exists and is never
written to. A banner describing an intention is worse than a plain one.

**Not solved.** Nothing is queued, so closing the tab still discards an in-flight
write, and the outbox remains phase-4 work. The 10-second deadline only bounds how
long the user is left waiting; it does not make offline writes possible.

**One consequence worth recording.** Bounding `pending` created a second bug, and
only browser testing found it. `WriteForm` guards against re-announcing the last
result, and it had been doing that with a boolean that latched `true` forever — so
only the *first* error a form ever produced was announced. Two consecutive failures
say the same thing, and the second was silent, which is the ADR-037 failure arriving
through a different door.

The obvious fix — remember the message rather than a boolean — does not work here,
because this hook makes the message *unobservably* stable: offline, `dispatch` clears
`localError` and re-sets it in the same handler, React batches the two, and the state
the caller sees is identical to what it saw before. So `useWriteAction` also returns
an `attempt` counter, which is the one thing that reliably differs between two
submissions. `WriteForm` keys its guards on `(attempt, message)` and skips while
`pending`, so a retry does not re-announce the failure it is replacing on its way
out.

Verified in a browser: three consecutive offline attempts each produce their toast,
and a successful delete still announces exactly once.

## ADR-042 - A queued write converges when replayed, and is never upserted

**Context.** Offline writing means a write is retried, and a retry that is not
idempotent is a financial record written twice. The inventory found the position
this starts from, and it is worse than "not yet handled":

- **No `upsert` and no `onConflict` anywhere in `src/`.** Nine distinct mutations,
  none of them an upsert.
- **`transactions` has no unique constraint.** Three indexes, all non-unique
  (`20260930184509_initial_schema.sql:158`, `:161`, `:164`). So a replayed
  transaction create **produces a second row**, and nothing in the system can tell
  the two apart afterwards.
- The budget and category guards are *uniqueness* constraints, not idempotency
  keys. Replaying a queued budget surfaces *"You already have an overall spending
  budget"* — a replay presented to the user as their own mistake.

**What makes it solvable: the primary key already accepts a client-chosen value.**
`transactions.id` is `uuid primary key default gen_random_uuid()`. The default
applies only when `id` is omitted, so the browser may supply its own. The same
holds for `accounts`, `categories` and `recurring_transactions`. **No migration is
required** — the feasibility study lists this as work, but it predates the schema.

**Decision. Converge by reading, not by upserting.**

1. Every queued create carries a `crypto.randomUUID()` generated in the browser at
   the moment the user pressed save, stored on the outbox row and used as the
   `id` of the insert.
2. Before replaying, the drain **reads** `select id … where id = <that uuid>`. Found
   means the write already landed and the op is dropped. Absent means it inserts.
3. **Never `upsert`.** This is the part that matters. An upsert on `id` would
   converge, but it would also *overwrite*: a row the user has since edited would be
   reverted to the payload that was queued, which is silent data loss. Insert plus
   read converges without ever writing over a newer row.
4. **Deletes are unconditional by id, and absent counts as success.** "Delete this
   transaction" is an intent about *existence*, not about content, so an edit
   elsewhere does not change what the user asked for. Replaying a delete whose row
   is already gone is convergence, not an error.
5. `postRecurringOccurrence` is already idempotent and needs none of this. Its
   watermark raises `23505` *"That occurrence has already been posted"* — which is
   precisely the already-applied signal, from the database, atomically.

**The general rule this amounts to: a queued write succeeds when the database is
already in the state it asked for.** Applied is not the same as inserted, and an
outbox that insists on the second will duplicate the first.

**Deliberately unresolved.** Whether a PostgREST unique-violation names the
constraint, so a primary-key replay could be told from a genuine name conflict in a
single round trip. `src/lib/queries/reference.ts:98` checks only `code === '23505'`
and cannot answer it, and a spike to read the raw error body did not complete: the
service-role key in `.env.local` returns `401 Invalid API key`, so it has never
been a working key, and the session-token route needs more work than the question
deserves. **The design above does not depend on the answer**, which is why
read-before-replay was chosen over a cheaper "treat `23505` as applied" rule. That
shorter rule would misreport a genuine duplicate category name as a successful
replay.

**Consequence.** A genuine conflict — a second category called "Food" — still
surfaces as an error naming the real problem, because that failure happens on
`insert` after the read said the id was absent. Replay convergence and honest
conflict reporting are therefore not in tension.

**Consequence.** Nothing here makes a queued write *durable*. IndexedDB can be
evicted on iOS and is unavailable in Safari private mode, which is why ADR-043
requires the UI to say a queued write is saved **on this device** rather than
saved.

## ADR-043 - A queued write may fail loudly, because it is not a cache

**Context.** `src/lib/client/idb.ts` fails soft everywhere, and the header
justifies it: *"Everything here fails soft… A cache that throws takes the app down
with it, so every operation resolves rather than rejects, and a missing database is
indistinguishable from an empty one. The caller is a cache: losing it must mean
'fetch again', never 'crash'."* That reasoning is correct for the `cache` store and
**wrong for `outbox`**. A user who spends money offline and is told "saved", and
whose entry then evaporates, has been lied to in the exact case where being lied to
costs them trust in their own ledger.

**Decision.**

1. **A failed enqueue is a visible failure, never a silent success.** `idbSet`
   already distinguishes the two without changing: an IDB `put` resolves with the
   key on success, so `idbSet` returns a string on success and `null` on failure,
   on a blocked upgrade, or when IndexedDB is missing entirely. The outbox treats
   that `null` as failure. `idb.ts` is **not modified** — its fail-soft posture
   stays exactly right for the cache, and the outbox simply refuses to inherit it.
2. **If the write cannot be queued at all, the UI says so.** Safari private mode
   and a storage-full iOS device make the outbox unavailable. The message names the
   real problem rather than confirming a save that did not happen.
3. **The wording is "saved on this device", never "saved".** ADR-042 makes replay
   converge; it cannot make the queue durable against eviction. The distinction is
   the honest one and it is also the useful one, because the user is being told
   something they can act on — open the app again somewhere with a connection.
4. **A permanent failure and a retryable failure are different events.** A duplicate
   category name will never succeed on its own, so the drain marks that row failed
   with the real reason and carries on. A network error will fail every remaining
   row too, so the drain **stops** rather than firing one doomed request per queued
   write. Ten queued writes must not become ten timeouts.
5. **Drains are triggered deliberately**: on app open, and on `online` while
   foregrounded. Safari will not drain a queue in the background, so the UI says
   that rather than implying a background sync exists.

**Consequence.** The outbox reports failures the cache cannot, which means it needs
its own error path — `enqueue` returns a result instead of the `void` the cache's
`idbSet` callers expect. That asymmetry is the point, and it is why the two stores
share a module but not a contract.
