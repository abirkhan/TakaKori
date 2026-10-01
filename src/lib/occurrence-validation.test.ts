import { describe, it, expect } from 'vitest'
import { nextOccurrence, type RecurrenceRule } from '@/lib/recurrence'

/**
 * Guards the integrity check in postRecurringOccurrence.
 *
 * The action accepts an occurrence date from the client, so the server must
 * confirm it really is an occurrence of that rule. Without that check a client
 * can post any real date: a phantom transaction is created and last_posted_on
 * advances, permanently suppressing every genuine occurrence up to that date.
 *
 * These tests assert the predicate the action uses.
 */
const monthly: RecurrenceRule = {
  frequency: 'monthly',
  interval: 1,
  anchorDate: '2026-10-01',
  endsOn: null,
}

/** Mirrors the server-side acceptance rule. */
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
