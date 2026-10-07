import { describe, it, expect } from 'vitest'
import { nextOccurrence, type RecurrenceRule } from '@/lib/recurrence'

/**
 * Guards the occurrence-validity *predicate*.
 *
 * **Read this before assuming it guards posting.** The predicate these tests
 * describe used to be the acceptance rule inside `postRecurringOccurrence`,
 * which is why they were the thing standing between a client and ADR-019's
 * attack. It no longer is. Posting is now one database function,
 * `public.post_recurring_occurrence`, because the app posts occurrences from the
 * browser and anything shipped to the browser can be edited.
 *
 * So these eight tests now guard **prediction** — what `dueOccurrences` shows
 * the user is due — and the write path is guarded by
 * `supabase/tests/post_recurring_occurrence.sql`, which asserts the same matrix
 * against the SQL implementation plus the idempotency and watermark behaviour
 * that cannot be expressed as a pure predicate at all.
 *
 * That split is the reason both exist. The TypeScript half is fast and runs in
 * `npm run verify`; the SQL half needs a database and is run by hand. The gap
 * between them is where the `yearly` bug lived: the SQL implementation advanced a
 * yearly rule one month at a time, and every test in this file passed throughout
 * because the TypeScript was correct. `npm run parity` compares the two.
 *
 * The attack being guarded, in both halves: without a real check, a client can
 * post any real date. A phantom transaction is created and `last_posted_on`
 * advances past it, permanently suppressing every genuine occurrence up to that
 * date.
 */
const monthly: RecurrenceRule = {
  frequency: 'monthly',
  interval: 1,
  anchorDate: '2026-10-01',
  endsOn: null,
}

/** Mirrors the acceptance rule, in TypeScript. The SQL twin is `recurring_add`
 * plus the walk in `post_recurring_occurrence`; they must agree. */
function isValidOccurrence(rule: RecurrenceRule, date: string): boolean {
  if (date < rule.anchorDate) return false
  const expected = nextOccurrence(rule, date)
  return expected !== null && expected.date === date
}

describe('occurrence validation', () => {
  it('accepts every genuine occurrence', () => {
    expect(isValidOccurrence(monthly, '2026-10-01')).toBe(true)
    expect(isValidOccurrence(monthly, '2026-11-01')).toBe(true)
    expect(isValidOccurrence(monthly, '2026-12-01')).toBe(true)
  })

  it('rejects a date that is not an occurrence', () => {
    // The exploit: posting the 25th of a month whose occurrence is the 1st.
    expect(isValidOccurrence(monthly, '2026-12-25')).toBe(false)
    expect(isValidOccurrence(monthly, '2026-10-15')).toBe(false)
    expect(isValidOccurrence(monthly, '2026-10-02')).toBe(false)
  })

  it('rejects a date before the anchor', () => {
    expect(isValidOccurrence(monthly, '2026-09-01')).toBe(false)
    expect(isValidOccurrence(monthly, '2025-01-01')).toBe(false)
  })

  it('accepts a clamped occurrence', () => {
    // A 31st rule genuinely fires on 28 February, so that must be accepted.
    const rule: RecurrenceRule = { ...monthly, anchorDate: '2026-01-31' }
    expect(isValidOccurrence(rule, '2026-02-28')).toBe(true)
    expect(isValidOccurrence(rule, '2026-02-27')).toBe(false)
  })

  it('accepts occurrences on a fortnightly rule only at the right parity', () => {
    const rule: RecurrenceRule = {
      frequency: 'monthly',
      interval: 2,
      anchorDate: '2026-01-01',
      endsOn: null,
    }
    expect(isValidOccurrence(rule, '2026-01-01')).toBe(true)
    expect(isValidOccurrence(rule, '2026-03-01')).toBe(true)
    expect(isValidOccurrence(rule, '2026-05-01')).toBe(true)
    expect(isValidOccurrence(rule, '2026-02-01')).toBe(false)
  })

  it('rejects occurrences past the end date', () => {
    const rule: RecurrenceRule = { ...monthly, endsOn: '2026-12-01' }
    expect(isValidOccurrence(rule, '2026-12-01')).toBe(true)
    expect(isValidOccurrence(rule, '2027-01-01')).toBe(false)
  })

  it('rejects a weekly rule on a non-weekday', () => {
    const rule: RecurrenceRule = {
      frequency: 'weekly',
      interval: 1,
      anchorDate: '2026-10-05',
      endsOn: null,
    }
    expect(isValidOccurrence(rule, '2026-10-05')).toBe(true)
    expect(isValidOccurrence(rule, '2026-10-12')).toBe(true)
    expect(isValidOccurrence(rule, '2026-10-07')).toBe(false)
  })

  it('stays correct far in the future without drifting', () => {
    // A malicious date years out must not be accepted by arithmetic accident.
    expect(isValidOccurrence(monthly, '2099-01-01')).toBe(true)
    expect(isValidOccurrence(monthly, '2099-01-15')).toBe(false)
  })
})
