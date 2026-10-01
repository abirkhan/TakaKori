import { describe, it, expect } from 'vitest'
import {
  daysInMonth,
  nextOccurrence,
  upcomingOccurrences,
  dueOccurrences,
  type RecurrenceRule,
} from '@/lib/recurrence'

const monthly = (anchor: string, interval = 1, endsOn: string | null = null): RecurrenceRule => ({
  frequency: 'monthly',
  interval,
  anchorDate: anchor,
  endsOn,
})

describe('daysInMonth', () => {
  it('handles 30-day, 31-day and 28-day months', () => {
    expect(daysInMonth(2026, 4)).toBe(30) // April
    expect(daysInMonth(2026, 1)).toBe(31) // January
    expect(daysInMonth(2026, 2)).toBe(28) // February, common year
  })

  it('handles a leap February', () => {
    expect(daysInMonth(2028, 2)).toBe(29)
    // 1900 was not a leap year; 2000 was. Divisible-by-400 rule.
    expect(daysInMonth(1900, 2)).toBe(28)
    expect(daysInMonth(2000, 2)).toBe(29)
  })

  it('handles December, where the day-0 trick crosses a year boundary', () => {
    expect(daysInMonth(2026, 12)).toBe(31)
  })
})

describe('nextOccurrence — monthly on the 1st', () => {
  it('returns the anchor when it is on or after the cursor', () => {
    expect(nextOccurrence(monthly('2026-01-01'), '2026-01-01')?.date).toBe('2026-01-01')
    expect(nextOccurrence(monthly('2026-01-01'), '2025-12-01')?.date).toBe('2026-01-01')
  })

  it('advances month by month', () => {
    const rule = monthly('2026-01-01')
    expect(nextOccurrence(rule, '2026-01-02')?.date).toBe('2026-02-01')
    expect(nextOccurrence(rule, '2026-02-02')?.date).toBe('2026-03-01')
    expect(nextOccurrence(rule, '2026-11-15')?.date).toBe('2026-12-01')
    expect(nextOccurrence(rule, '2026-12-02')?.date).toBe('2027-01-01')
  })
})

describe('nextOccurrence — month-end clamping', () => {
  // The important cases. A 31st anchor must never overflow into the next month
  // and must never be silently skipped.
  it('clamps the 31st to 30 April', () => {
    const r = nextOccurrence(monthly('2026-01-31'), '2026-04-01')
    expect(r?.date).toBe('2026-04-30')
    expect(r?.clamped).toBe(true)
  })

  it('clamps the 31st to 28 February in a common year', () => {
    const r = nextOccurrence(monthly('2026-01-31'), '2026-02-01')
    expect(r?.date).toBe('2026-02-28')
    expect(r?.clamped).toBe(true)
  })

  it('clamps to 29 February in a leap year, not 28', () => {
    const r = nextOccurrence(monthly('2028-01-31'), '2028-02-01')
    expect(r?.date).toBe('2028-02-29')
    expect(r?.clamped).toBe(true)
  })

  it('does not report clamping when the day fits', () => {
    const r = nextOccurrence(monthly('2026-01-15'), '2026-02-01')
    expect(r?.date).toBe('2026-02-15')
    expect(r?.clamped).toBe(false)
  })

  it('recovers the 31st in a 31-day month after a clamped February', () => {
    // The series must recover its full day-of-month rather than staying pinned
    // to the clamped one. Verified through upcomingOccurrences, which steps
    // past each occurrence with addDays(date, 1) - the documented way to walk
    // the series forward.
    const out = upcomingOccurrences(monthly('2026-01-31'), '2026-01-31', 6)
    expect(out.map((o) => o.date)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ])
  })
})

describe('nextOccurrence — intervals', () => {
  it('supports fortnightly', () => {
    const rule: RecurrenceRule = {
      frequency: 'monthly',
      interval: 2,
      anchorDate: '2026-01-01',
      endsOn: null,
    }
    expect(nextOccurrence(rule, '2026-01-02')?.date).toBe('2026-03-01')
    expect(nextOccurrence(rule, '2026-03-02')?.date).toBe('2026-05-01')
  })

  it('supports weekly', () => {
    const rule: RecurrenceRule = {
      frequency: 'weekly',
      interval: 1,
      anchorDate: '2026-01-05',
      endsOn: null,
    }
    // Contract: the first occurrence on or after the cursor. 12 Jan is itself an
    // occurrence, so it is returned; the caller advances past it to get the 19th.
    expect(nextOccurrence(rule, '2026-01-05')?.date).toBe('2026-01-05')
    expect(nextOccurrence(rule, '2026-01-06')?.date).toBe('2026-01-12')
    expect(nextOccurrence(rule, '2026-01-12')?.date).toBe('2026-01-12')
    expect(nextOccurrence(rule, '2026-01-13')?.date).toBe('2026-01-19')
  })

  it('supports every two weeks', () => {
    const rule: RecurrenceRule = {
      frequency: 'weekly',
      interval: 2,
      anchorDate: '2026-01-05',
      endsOn: null,
    }
    expect(nextOccurrence(rule, '2026-01-06')?.date).toBe('2026-01-19')
    expect(nextOccurrence(rule, '2026-01-19')?.date).toBe('2026-01-19')
    expect(nextOccurrence(rule, '2026-01-20')?.date).toBe('2026-02-02')
  })

  // Regression: rounding elapsed intervals to zero returned the anchor date,
  // which is by definition before the cursor.
  it('never returns an occurrence before the cursor', () => {
    const rules: RecurrenceRule[] = [
      { frequency: 'weekly', interval: 1, anchorDate: '2026-01-05', endsOn: null },
      { frequency: 'weekly', interval: 2, anchorDate: '2026-01-05', endsOn: null },
      { frequency: 'daily', interval: 1, anchorDate: '2026-01-01', endsOn: null },
      { frequency: 'daily', interval: 3, anchorDate: '2026-01-01', endsOn: null },
    ]
    for (const rule of rules) {
      for (const from of ['2026-01-02', '2026-01-06', '2026-01-20', '2026-06-15']) {
        const next = nextOccurrence(rule, from)
        if (next) {
          expect(next.date >= from).toBe(true)
        }
      }
    }
  })

  it('supports daily', () => {
    const rule: RecurrenceRule = {
      frequency: 'daily',
      interval: 1,
      anchorDate: '2026-01-01',
      endsOn: null,
    }
    expect(nextOccurrence(rule, '2026-01-01')?.date).toBe('2026-01-01')
    expect(nextOccurrence(rule, '2026-01-10')?.date).toBe('2026-01-10')
  })

  it('supports yearly, clamping 29 February onto 28 Feb in common years', () => {
    const rule: RecurrenceRule = {
      frequency: 'yearly',
      interval: 1,
      anchorDate: '2028-02-29',
      endsOn: null,
    }
    // 2028 is a leap year so the first anniversary is exact.
    expect(nextOccurrence(rule, '2028-03-01')?.date).toBe('2029-02-28')
  })

  it('preserves month and day for an ordinary yearly rule', () => {
    const rule: RecurrenceRule = {
      frequency: 'yearly',
      interval: 1,
      anchorDate: '2026-03-15',
      endsOn: null,
    }
    expect(nextOccurrence(rule, '2026-03-16')?.date).toBe('2027-03-15')
  })
})

describe('end dates', () => {
  it('returns null once the series has ended', () => {
    const rule = monthly('2026-01-01', 1, '2026-03-01')
    expect(nextOccurrence(rule, '2026-03-02')).toBeNull()
  })

  it('includes an occurrence exactly on the end date', () => {
    const rule = monthly('2026-01-01', 1, '2026-03-01')
    expect(nextOccurrence(rule, '2026-02-15')?.date).toBe('2026-03-01')
  })

  it('returns null when the cursor is past the end date', () => {
    expect(nextOccurrence(monthly('2026-01-01', 1, '2026-02-01'), '2026-06-01')).toBeNull()
  })
})

describe('upcomingOccurrences', () => {
  it('returns the requested count in ascending order', () => {
    const out = upcomingOccurrences(monthly('2026-01-01'), '2026-01-01', 3)
    expect(out.map((o) => o.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
  })

  it('never repeats an occurrence', () => {
    const out = upcomingOccurrences(monthly('2026-01-31'), '2026-01-31', 6)
    expect(out.map((o) => o.date)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ])
    expect(new Set(out.map((o) => o.date)).size).toBe(out.length)
  })

  it('stops early when the series ends', () => {
    const out = upcomingOccurrences(monthly('2026-01-01', 1, '2026-03-01'), '2026-01-01', 6)
    expect(out.map((o) => o.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
  })
})

describe('dueOccurrences — idempotency', () => {
  it('offers only occurrences up to the cut-off date', () => {
    const out = dueOccurrences(monthly('2026-01-01'), '2026-01-01', '2026-03-15', null)
    expect(out.map((o) => o.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
  })

  // The guard that makes one-tap posting safe: a second tap cannot create a
  // duplicate financial record.
  it('never offers an occurrence at or before last_posted_on', () => {
    const out = dueOccurrences(monthly('2026-01-01'), '2026-01-01', '2026-03-15', '2026-02-01')
    expect(out.map((o) => o.date)).toEqual(['2026-03-01'])
  })

  it('offers nothing when everything through the cut-off is posted', () => {
    const out = dueOccurrences(monthly('2026-01-01'), '2026-01-01', '2026-03-15', '2026-03-01')
    expect(out).toEqual([])
  })

  it('still offers future occurrences after a posting', () => {
    const out = dueOccurrences(monthly('2026-01-01'), '2026-01-01', '2026-06-15', '2026-01-01')
    expect(out.map((o) => o.date)).toEqual([
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
    ])
  })
})