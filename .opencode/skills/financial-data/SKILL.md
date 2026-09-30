---
name: Financial Data
description: Rules for money representation, transfers, balances, and date ranges in TakaKori. Load before writing any code that reads, writes, sums, formats, or displays money or dates.
---

# Financial data

This app stores other people's financial records. Financial correctness is the
product. A balance that is off by one poisha is a bug, not a rounding detail.

## Money is never a JS number

`numeric(14,2)` crosses PostgREST as a **string**: `{ amount: "3500.00" }`.

```ts
// These are all wrong, and all produce plausible-looking nonsense.
amount + 100            // "3500.00100"
Number(amount) + 0.1    // 3500.1, but 0.1+0.2 !== 0.3
amount.toFixed(2)       // fine as output, never as input
```

## Use `lib/money.ts`. It is the only place.

```ts
import { toMinor, parseAmount, formatMinor, toNumericString } from '@/lib/money'

toMinor('3500.00')          // 350000   — from the database
parseAmount('500.50')       // 50050    — from a form
toNumericString(350000)     // "3500.00" — to the database
formatMinor(350000)          // "৳ 3,50,000.00"
```

Never add a second money helper. Never do arithmetic on a raw amount.

## Aggregate in SQL, never in JavaScript

```ts
// Wrong: string arithmetic in the browser, and it cannot be indexed.
const total = rows.reduce((sum, row) => sum + toMinor(row.amount), 0)

// Right: one indexed aggregate, exact decimal arithmetic.
const { data } = await supabase.from('workspace_totals').select('*').eq('workspace_id', id).single()
```

Use `workspace_totals`, `account_balances`, and `expense_by_category`. They
already encode the transfer semantics correctly.

## Transfers are not income and not expense

`type` is `income | expense | transfer`. Moving money between your own accounts
is neither.

- `workspace_totals` excludes transfers from income and expense.
- `account_balances` applies a transfer as −amount on the source and +amount on
  the destination.

A transfer that appears in income or expense is a bug. If a report needs to show
moved money, use `total_transferred`.

## Rounding

- Never round silently. `parseAmount` rejects sub-poisha precision rather than
  rounding to fit.
- Money is unsigned. Direction comes from `type`. There is no negative `amount`,
  so there is no `-0` and no double-negative confusion.
- Format with `formatMinor`. Do not use `Intl.NumberFormat` with
  `style: 'currency'` for BDT — see ADR-011.

## Dates are the user's calendar days

`occurred_on` is a `date`. Ranges are resolved in `profiles.timezone`, never UTC.

```ts
// Wrong: shifts "this month" by a day for UTC+6 users.
const from = new Date().toISOString().slice(0, 7)

// Right.
const range = resolveRange('month', profile.timezone)
```

Week starts on Saturday (Bangladesh convention). February in a leap year ends
on the 29th; in a common year, the 28th. Both are covered in `lib/dates.ts`.

## Invariants worth defending in review

- An income or expense must have a category; a transfer must not.
- The category's `type` must equal the transaction's `type`.
- `amount > 0`, always.
- A transfer's two accounts must differ.
- Deleting a category sets `category_id` to null; it never deletes transactions.

These are enforced by CHECK constraints in the database. Application validation
mirrors them for good error messages, but the database is the authority.