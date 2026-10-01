import { describe, it, expect } from 'vitest'
import {
  computeBudgetProgress,
  daysBetween,
  daysInCalendarMonth,
  monthStartOf,
} from '@/lib/budgets'

/** 1,000 BDT expressed in minor units (poisha) to match lib/money. */
const T = 100_000

const oct = { monthStart: '2026-10-01', today: '2026-10-01', daysInMonth: 31 }

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-10-01', '2026-10-01')).toBe(0)
    expect(daysBetween('2026-10-01', '2026-10-11')).toBe(10)
    expect(daysBetween('2026-10-01', '2026-11-01')).toBe(31)
  })

  it('is not confused by the UTC offset of Date.parse', () => {
    // The classic trap: parsing 'YYYY-MM-DD' as a local time shifts the day for
    // negative UTC offsets. Building from Date.UTC avoids it entirely.
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2) // 2026 is not a leap year
    expect(daysBetween('2028-02-27', '2028-03-01')).toBe(3) // leap year
  })
})

describe('daysInCalendarMonth and monthStartOf', () => {
  it('knows month lengths', () => {
    expect(daysInCalendarMonth(2026, 10)).toBe(31)
    expect(daysInCalendarMonth(2026, 2)).toBe(28)
    expect(daysInCalendarMonth(2028, 2)).toBe(29)
    expect(daysInCalendarMonth(2026, 4)).toBe(30)
  })

  it('extracts the first of the month', () => {
    expect(monthStartOf('2026-10-17')).toBe('2026-10-01')
  })
})

describe('computeBudgetProgress — basics', () => {
  it('computes remaining and percent for a partly spent budget', () => {
    const p = computeBudgetProgress(10 * T, 3 * T, { ...oct, today: '2026-10-31' })
    expect(p.spent).toBe(3 * T)
    expect(p.remaining).toBe(7 * T)
    expect(p.percentUsed).toBeCloseTo(30)
    expect(p.overspent).toBe(false)
  })

  it('flags overspending', () => {
    const p = computeBudgetProgress(10 * T, 12 * T, { ...oct, today: '2026-10-31' })
    expect(p.overspent).toBe(true)
    expect(p.remaining).toBe(-2 * T)
    expect(p.percentUsed).toBeCloseTo(120)
  })

  it('treats exactly hitting the limit as not overspent', () => {
    const p = computeBudgetProgress(10 * T, 10 * T, { ...oct, today: '2026-10-31' })
    expect(p.overspent).toBe(false)
    expect(p.remaining).toBe(0)
  })

  it('handles an unspend budget without dividing by zero', () => {
    const p = computeBudgetProgress(10 * T, 0, oct)
    expect(p.percentUsed).toBe(0)
    expect(p.remaining).toBe(10 * T)
    expect(p.dailyRate).toBe(0)
    expect(p.projected).toBeNull()
  })

  it('does not divide by zero for a zero limit', () => {
    const p = computeBudgetProgress(0, 5 * T, { ...oct, today: '2026-10-15' })
    expect(p.percentUsed).toBe(0)
    expect(p.overspent).toBe(true)
    expect(Number.isNaN(p.projected)).toBe(false)
  })
})

describe('computeBudgetProgress — pace', () => {
  // The behaviour that makes a budget actionable: half spent on day 5 means
  // the month will be blown by a wide margin.
  it('detects overspending pace early in the month', () => {
    const p = computeBudgetProgress(10 * T, 5 * T, { ...oct, today: '2026-10-05' })
    // 5,000 spent in 5 days is 1,000/day; over 31 days that projects to 31,000.
    expect(p.dailyRate).toBe(1 * T)
    expect(p.projected).toBe(31 * T)
    expect(p.onTrackToOverspend).toBe(true)
    expect(p.overspent).toBe(false) // not yet, but heading there
  })

  it('is on pace when spending matches the elapsed proportion', () => {
    // 3,100 over 31 days is 100/day. Spending 1,000 by day 10 projects to
    // exactly 3,100, so the projection lands precisely on the limit.
    const p = computeBudgetProgress(310_000, 100_000, { ...oct, today: '2026-10-10' })
    expect(p.projected).toBe(310_000)
    expect(p.onTrackToOverspend).toBe(false)
    expect(p.overspent).toBe(false)
  })

  it('is under pace when spending is light', () => {
    const p = computeBudgetProgress(10 * T, 100, { ...oct, today: '2026-10-11' })
    expect(p.onTrackToOverspend).toBe(false)
  })

  it('never divides by zero on the first of the month', () => {
    const p = computeBudgetProgress(10 * T, 2 * T, oct)
    expect(Number.isFinite(p.dailyRate)).toBe(true)
    expect(Number.isFinite(p.projected as number)).toBe(true)
    expect(p.dailyRate).toBe(2 * T) // day 1: the whole spend is the day's rate
  })

  it('clamps a stale or wrong clock rather than going negative', () => {
    const before = computeBudgetProgress(10 * T, 5 * T, { ...oct, today: '2026-09-01' })
    expect(before.dailyRate).toBeGreaterThanOrEqual(0)
    const after = computeBudgetProgress(10 * T, 5 * T, { ...oct, today: '2026-12-31' })
    // Elapsed is clamped to the month length, so the rate cannot collapse.
    expect(after.dailyRate).toBe(Math.round((5 * T) / 31))
  })

  it('uses days elapsed, not days remaining, for the rate', () => {
    const early = computeBudgetProgress(100 * T, 10 * T, { ...oct, today: '2026-10-10' })
    const late = computeBudgetProgress(100 * T, 10 * T, { ...oct, today: '2026-10-31' })
    expect(early.dailyRate).toBe(T) // 10,000 over 10 days elapsed
    expect(late.dailyRate).toBeLessThan(early.dailyRate)
  })

  it('projects the full month, not the remaining days', () => {
    // Spending in the last third should not imply a full month's spend.
    const p = computeBudgetProgress(100 * T, 30 * T, { ...oct, today: '2026-10-31' })
    expect(p.projected).toBe(30 * T)
  })

  it('keeps sub-poisha arithmetic exact', () => {
    // 1000.50 BDT spent over 3 days: rate must not drift to a float artefact.
    const p = computeBudgetProgress(100 * T, 100_050, { ...oct, today: '2026-10-03' })
    expect(Number.isInteger(p.dailyRate)).toBe(true)
    expect(Number.isInteger(p.projected as number)).toBe(true)
  })
})
