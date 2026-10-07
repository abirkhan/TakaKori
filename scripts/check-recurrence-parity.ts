/**
 * Cross-checks the two recurrence implementations.
 *
 *   npm run parity
 *
 * There are now two implementations of the occurrence arithmetic:
 * `src/lib/recurrence.ts`, which predicts what is due, and
 * `private.recurring_add` plus the walk in
 * `public.post_recurring_occurrence`, which validates a date at write time
 * (ADR-032). Nothing in `npm run verify` compares them, and that gap is not
 * theoretical: the first SQL version handled `daily` and `weekly` and let
 * `yearly` fall through to the month-shifting branch, so a yearly rule advanced
 * one month at a time. A 29 February anchor resolved to 2025-01-29 where
 * TypeScript resolved 2025-02-28, and all 157 tests passed throughout because
 * the TypeScript was correct and the bug was in code they no longer covered.
 *
 * So: run this, run the query it prints, compare. Sixteen cases, chosen for the
 * arithmetic that is easy to get wrong — month-end clamping, leap Februaries,
 * bimonthly drifting across a clamp, yearly, and a `from` before the anchor.
 *
 * Not part of `npm run verify`, because it needs a database.
 */
import { nextOccurrence, type Frequency } from '../src/lib/recurrence'

interface Case {
  frequency: Frequency
  interval: number
  anchorDate: string
  from: string
}

/**
 * Mirrors the `cases` CTE in `supabase/tests/post_recurring_occurrence.sql`.
 * The three must stay in step; if you add a case here, add it there too.
 */
const CASES: Case[] = [
  // Month-end clamping. The 31st into short and leap Februaries.
  { frequency: 'monthly', interval: 1, anchorDate: '2026-01-31', from: '2026-02-01' },
  { frequency: 'monthly', interval: 1, anchorDate: '2026-01-31', from: '2024-02-01' },
  { frequency: 'monthly', interval: 1, anchorDate: '2024-01-31', from: '2025-02-01' },
  { frequency: 'monthly', interval: 1, anchorDate: '2026-01-30', from: '2026-02-01' },
  // Bimonthly, drifting across a clamp and then back off one.
  { frequency: 'monthly', interval: 2, anchorDate: '2026-01-31', from: '2026-02-01' },
  { frequency: 'monthly', interval: 2, anchorDate: '2026-01-31', from: '2026-03-01' },
  // A `from` before the anchor, and exactly on it.
  { frequency: 'monthly', interval: 1, anchorDate: '2026-03-15', from: '2026-01-01' },
  { frequency: 'monthly', interval: 1, anchorDate: '2026-03-15', from: '2026-03-15' },
  // Yearly. These three are the regression cases for the bug above.
  { frequency: 'yearly', interval: 1, anchorDate: '2024-02-29', from: '2025-01-01' },
  { frequency: 'yearly', interval: 1, anchorDate: '2026-01-31', from: '2027-01-01' },
  { frequency: 'yearly', interval: 2, anchorDate: '2024-02-29', from: '2027-01-01' },
  // Weekly and fortnightly, including a cursor between two occurrences.
  { frequency: 'weekly', interval: 1, anchorDate: '2026-01-05', from: '2026-02-02' },
  { frequency: 'weekly', interval: 2, anchorDate: '2026-01-05', from: '2026-02-02' },
  { frequency: 'weekly', interval: 2, anchorDate: '2026-01-05', from: '2026-01-20' },
  // Daily, and every-seventh-day.
  { frequency: 'daily', interval: 1, anchorDate: '2026-01-01', from: '2026-03-15' },
  { frequency: 'daily', interval: 7, anchorDate: '2026-01-01', from: '2026-02-10' },
]

const rows = CASES.map((c) => {
  const occurrence = nextOccurrence(
    { frequency: c.frequency, interval: c.interval, anchorDate: c.anchorDate },
    c.from,
  )
  return {
    ...c,
    date: occurrence?.date ?? null,
    clamped: occurrence?.clamped ?? false,
  }
})

console.log('TypeScript — src/lib/recurrence.ts\n')
for (const r of rows) {
  console.log(
    `  ${r.frequency.padEnd(7)} x${String(r.interval).padEnd(2)} ${r.anchorDate} from ${r.from} ` +
      `-> ${r.date ?? 'null'}${r.clamped ? ' (clamped)' : ''}`,
  )
}

const values = rows
  .map(
    (r) =>
      `    ('${r.frequency}', ${r.interval}, date '${r.anchorDate}', date '${r.from}', date '${r.date}')`,
  )
  .join(',\n')

console.log(`
SQL — paste into the linked project, or run
supabase/tests/post_recurring_occurrence.sql, which asserts this matrix:

with cases(freq, ivl, anchor, from_date, expected) as (
  values
${values}
),
walk as (
  select c.*, s.step,
         private.recurring_add(c.anchor, c.freq, s.step * c.ivl) as candidate
  from cases c
  cross join lateral generate_series(0, 4000) as s(step)
),
resolved as (
  select freq, ivl, anchor, from_date, expected,
         min(candidate) filter (where candidate >= from_date) as sql_next
  from walk
  group by freq, ivl, anchor, from_date, expected
)
select freq, ivl, anchor, from_date, expected, sql_next,
       case when sql_next is distinct from expected then 'MISMATCH' else 'ok' end as verdict
from resolved
order by freq, ivl, anchor, from_date;

Any row reading MISMATCH is a bug in whichever implementation is wrong. Fix the
SQL, never the TypeScript: the TypeScript has 27 passing tests and the SQL has
sixteen cases and a database.`)
