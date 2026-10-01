---
name: Testing
description: Testing strategy and requirements for TakaKori — Vitest for pure logic, RLS tests against Supabase, Playwright for E2E. Load before adding tests or deciding what a feature needs to prove.
---

# Testing

## Layers

```
Unit          Vitest      pure logic, no I/O
Integration   Vitest      against a real Supabase project
RLS           Vitest      two users, cross-tenant denial
E2E           Playwright  real browser, real flow
```

Tests that cannot run in this environment (no Docker, so no local Supabase) run
against the linked **development** project, never production.

## What has a unit test

Anything where a silent wrong answer is plausible:

- `lib/money.ts` — parsing, formatting, rounding, string-vs-number
- `lib/dates.ts` — timezone boundaries, month lengths, leap years, DST
- `lib/validations.ts` — every rejection path

These are where bugs hide. Two real bugs were caught by tests written before the
feature shipped: `Date.parse` accepting 2026-02-30, and `Intl` silently falling
back to `en` for BDT currency formatting.

## Assert exact output, not properties

```ts
// Weak — passes even when grouping and symbol are both wrong.
expect(formatMinor(12500000)).toContain('1,25,000')

// Strong — catches the en-BD fallback to "BDT 125,000.00".
expect(formatMinor(12500000)).toBe('৳ 1,25,000.00')
```

The weak form passed while the feature was actually broken. Prefer exact string
comparison for any display helper.

## RLS tests

RLS cannot be unit-tested — the policy is SQL. Test it as a user would attack
it:

```ts
test('user B cannot read user A transactions', async () => {
  const { data } = await clientA.from('transactions').select()
  expect(data).toHaveLength(1)

  const { data: leaked, error } = await clientB.from('transactions').select().eq('id', data![0].id)

  expect(leaked).toEqual([])
  expect(error).toBeNull() // RLS filters silently; it does not error
})
```

That last assertion matters. RLS **filters** rows rather than raising an error,
so a test that only checks for an error will pass while data leaks.

Cover, for every table: select, insert, update, delete, and the cross-workspace
reference attempt.

## E2E

Playwright drives a real browser for flows a unit test cannot reach: login,
redirect behaviour, form submission, and the dashboard reflecting a new
transaction after refresh.

Verify through the UI, not by asserting on internal state. "The dashboard total
increased" is the claim that matters.

Setup lives in `.env.test` (gitignored); copy `.env.test.example` and fill in a
throwaway account. The suite needs the dev server running and two accounts on it
(Cash and Bank) for the transfer test.

### Clean up through the product, not a privileged script

Tests delete what they created using the app's own delete button. The first
version of this suite reached for a `/api/test-cleanup` route and a
service-role script instead. Both were rejected:

- An HTTP route that deletes rows on request is a live vulnerability. It would
  have shipped to production, because test-only endpoints outlive the tests that
  needed them.
- A service-role script needs a key this project otherwise never touches, which
  widens the blast radius of a leaked `.env` for no product benefit.

Driving the real delete control also means the delete path is exercised on every
run.

Two tests only read, so they use `authedTest`; only tests that write use
`writingTest`, which owns the teardown. Splitting them matters: cleanup can only
run while the session is alive, so a sign-out test would fail its own teardown.

## Locating form fields in E2E tests

By `name` attribute, not by label text. The labels wrap their control, so the
accessible name picks up the option and error text inside them:
`getByLabel('Account', { exact: true })` matches **nothing**, and the substring
form matches both `Account` and `To account` once a transfer is selected.

`sr-only` radio inputs cannot be driven directly. `check()` rejects them as
invisible, and `check({ force: true })` silently does nothing — it dispatches at
the clipped input's coordinates where nothing is painted, so React never sees the
change. Click the wrapping `<label>`.

## Running

```bash
npm run test              # unit
npm run test:coverage     # with coverage
npm run test:e2e          # requires `npx playwright install` once
npm run verify            # everything: typecheck, lint, test, build
```

`npm run verify` does **not** run E2E, because it needs a browser and a live
database. Run `npm run test:e2e` before reporting a change to any user-facing
flow. This is not optional politeness: the disabled-filter-bar bug in ADR-022
passed all 124 unit tests and the whole `verify` gate, and E2E caught it in
about a minute.

## Definition of done

A task is not complete until `npm run verify` passes, plus `npm run test:e2e` if
it touched a user-facing flow. Do not report success on the basis that the code
"should work" — that is the failure mode this project exists to avoid.
