import { describe, it, expect } from 'vitest'
import { resolveRange, startOfMonthOffset } from '@/lib/dates'

const DHAKA = 'Asia/Dhaka'

describe('resolveRange — quarter', () => {
  it('covers Q3 as July to September', () => {
    // 2026-08-15 falls in Jul-Sep.
    expect(resolveRange('quarter', DHAKA, new Date('2026-08-15T06:00:00Z'))).toEqual({
      from: '2026-07-01',
      to: '2026-09-30',
    })
  })

  it('covers Q1 as January to March', () => {
    expect(resolveRange('quarter', DHAKA, new Date('2026-02-10T06:00:00Z'))).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
    })
  })

  it('covers Q4 correctly across a year boundary', () => {
    // Oct-Dec. Guards the +2 month arithmetic, which must not spill into 2027.
    expect(resolveRange('quarter', DHAKA, new Date('2026-11-20T06:00:00Z'))).toEqual({
      from: '2026-10-01',
      to: '2026-12-31',
    })
  })

  it('handles Q1 of a leap year ending on 31 March', () => {
    expect(resolveRange('quarter', DHAKA, new Date('2028-01-05T06:00:00Z'))).toEqual({
      from: '2028-01-01',
      to: '2028-03-31',
    })
  })

  it('uses the local calendar month, not UTC', () => {
    // 2026-09-30T18:30Z is already 1 Oct in Dhaka, so the quarter is Q4.
    expect(resolveRange('quarter', DHAKA, new Date('2026-09-30T18:30:00Z'))).toEqual({
      from: '2026-10-01',
      to: '2026-12-31',
    })
  })
})

describe('startOfMonthOffset', () => {
  it('returns the same month for zero', () => {
    expect(startOfMonthOffset('2026-08-15', 0)).toBe('2026-08-01')
  })

  it('counts back across a year boundary', () => {
    expect(startOfMonthOffset('2026-01-15', 1)).toBe('2025-12-01')
    expect(startOfMonthOffset('2026-01-15', 12)).toBe('2025-01-01')
  })

  it('normalises any day to the first of the month', () => {
    expect(startOfMonthOffset('2026-08-31', 0)).toBe('2026-08-01')
    expect(startOfMonthOffset('2026-08-01', 0)).toBe('2026-08-01')
  })

  it('handles a leap-year February', () => {
    expect(startOfMonthOffset('2028-02-29', 1)).toBe('2028-01-01')
  })
})