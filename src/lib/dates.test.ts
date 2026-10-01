import { describe, it, expect } from 'vitest'
import { resolveRange, todayIn, startOfDayIn } from '@/lib/dates'

const DHAKA = 'Asia/Dhaka' // UTC+6, no DST
const KOLKATA = 'Asia/Kolkata' // UTC+5:30 — half-hour offset
const NEW_YORK = 'America/New_York' // has DST

describe('todayIn', () => {
  it('uses the calendar day in the target timezone, not UTC', () => {
    // 2026-09-30T18:30:00Z is already 2026-10-01 in Dhaka.
    const instant = new Date('2026-09-30T18:30:00Z')
    expect(todayIn(DHAKA, instant)).toBe('2026-10-01')
    expect(todayIn('UTC', instant)).toBe('2026-09-30')
  })

  it('handles a half-hour timezone offset', () => {
    // 18:45Z is 00:15 the next day in Kolkata (UTC+5:30).
    const instant = new Date('2026-09-30T18:45:00Z')
    expect(todayIn(KOLKATA, instant)).toBe('2026-10-01')
  })
})

describe('resolveRange — month', () => {
  it('spans the full calendar month in the user timezone', () => {
    const now = new Date('2026-09-30T12:00:00Z')
    expect(resolveRange('month', DHAKA, now)).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    })
  })

  it('handles months with 30 days', () => {
    expect(resolveRange('month', DHAKA, new Date('2026-04-15T06:00:00Z'))).toEqual({
      from: '2026-04-01',
      to: '2026-04-30',
    })
  })

  it('handles February in a leap year', () => {
    expect(resolveRange('month', DHAKA, new Date('2028-02-10T06:00:00Z'))).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    })
  })

  it('handles February in a non-leap year', () => {
    expect(resolveRange('month', DHAKA, new Date('2027-02-10T06:00:00Z'))).toEqual({
      from: '2027-02-01',
      to: '2027-02-28',
    })
  })

  it('rolls to the previous month when local date has crossed midnight', () => {
    // 18:30Z on 30 Sep is 01:30 on 1 Oct in Dhaka, so the current month is October.
    const instant = new Date('2026-09-30T18:30:00Z')
    expect(resolveRange('month', DHAKA, instant)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    })
  })
})

describe('resolveRange — today and week', () => {
  it('resolves today to a single-day range', () => {
    const now = new Date('2026-09-30T06:00:00Z')
    expect(resolveRange('today', DHAKA, now)).toEqual({
      from: '2026-09-30',
      to: '2026-09-30',
    })
  })

  it('starts the week on Saturday', () => {
    // 2026-09-30 is a Wednesday. Saturday of that week is 2026-09-26.
    const now = new Date('2026-09-30T06:00:00Z')
    const range = resolveRange('week', DHAKA, now)
    expect(range?.from).toBe('2026-09-26')
    expect(range?.to).toBe('2026-09-30')
  })
})

describe('resolveRange — year and all', () => {
  it('spans the calendar year', () => {
    expect(resolveRange('year', DHAKA, new Date('2026-05-05T06:00:00Z'))).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    })
  })

  it('returns null for all-time so the caller omits date filters', () => {
    expect(resolveRange('all', DHAKA)).toBeNull()
  })

  it('throws when custom has no dates rather than silently defaulting', () => {
    expect(() => resolveRange('custom', DHAKA)).toThrow(/from and to/)
  })

  it('passes custom ranges through unchanged', () => {
    expect(
      resolveRange('custom', DHAKA, new Date(), { from: '2026-01-01', to: '2026-03-31' }),
    ).toEqual({ from: '2026-01-01', to: '2026-03-31' })
  })
})

describe('startOfDayIn', () => {
  it('maps local midnight to the correct UTC instant', () => {
    const start = startOfDayIn(DHAKA, '2026-09-30')
    expect(start.toISOString()).toBe('2026-09-29T18:00:00.000Z')
  })

  it('handles half-hour offsets', () => {
    const start = startOfDayIn(KOLKATA, '2026-09-30')
    expect(start.toISOString()).toBe('2026-09-29T18:30:00.000Z')
  })

  it('accounts for DST instead of assuming a fixed offset', () => {
    // In September New York is UTC-4 (EDT); in January UTC-5 (EST).
    const summer = startOfDayIn(NEW_YORK, '2026-09-30')
    const winter = startOfDayIn(NEW_YORK, '2026-01-30')
    expect(summer.toISOString()).toBe('2026-09-30T04:00:00.000Z')
    expect(winter.toISOString()).toBe('2026-01-30T05:00:00.000Z')
  })

  it('round-trips back to the same calendar day', () => {
    for (const tz of [DHAKA, KOLKATA, NEW_YORK]) {
      expect(todayIn(tz, startOfDayIn(tz, '2026-09-30'))).toBe('2026-09-30')
    }
  })
})
