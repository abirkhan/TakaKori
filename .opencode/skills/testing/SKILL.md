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

  const { data: leaked, error } = await clientB
    .from('transactions').select().eq('id', data![0].id)

  expect(leaked).toEqual([])
  expect(error).toBeNull()   // RLS filters silently; it does not error
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

## Running

```bash
npm run test              # unit
npm run test:coverage     # with coverage
npm run test:e2e          # requires `npx playwright install` once
npm run verify            # everything: typecheck, lint, test, build
```

## Definition of done

A task is not complete until `npm run verify` passes. Do not report success on
the basis that the code "should work" — that is the failure mode this project
exists to avoid.