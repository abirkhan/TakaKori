import { describe, it, expect } from 'vitest'
import {
  toMinor,
  parseAmount,
  toNumericString,
  formatMinor,
  formatSignedMinor,
  MoneyError,
} from '@/lib/money'

describe('toMinor — parsing values coming back from Postgres', () => {
  it('parses the string form PostgREST actually returns', () => {
    // This is the real shape over the wire. Not a number.
    expect(toMinor('3500.00')).toBe(350000)
    expect(toMinor('0.01')).toBe(1)
    expect(toMinor('0')).toBe(0)
  })

  it('accepts numbers defensively', () => {
    expect(toMinor(3500)).toBe(350000)
    expect(toMinor(0.5)).toBe(50)
  })

  it('treats null/undefined/empty as zero rather than NaN', () => {
    expect(toMinor(null)).toBe(0)
    expect(toMinor(undefined)).toBe(0)
    expect(toMinor('')).toBe(0)
  })

  it('does not accumulate float error across a sequence', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in raw float arithmetic.
    expect(toMinor('0.1') + toMinor('0.2')).toBe(toMinor('0.3'))
  })
})

describe('parseAmount — user input validation', () => {
  it('parses plain and decimal amounts', () => {
    expect(parseAmount('500')).toBe(50000)
    expect(parseAmount('500.50')).toBe(50050)
    expect(parseAmount('0.01')).toBe(1)
  })

  it('rejects an empty amount', () => {
    expect(() => parseAmount('')).toThrow(MoneyError)
    expect(() => parseAmount('   ')).toThrow(MoneyError)
  })

  it('rejects non-numeric input instead of returning NaN', () => {
    expect(() => parseAmount('abc')).toThrow(MoneyError)
    expect(() => parseAmount('12abc')).toThrow(MoneyError)
    expect(() => parseAmount('1,500')).toThrow(MoneyError)
  })

  it('rejects sub-poisha precision rather than silently rounding', () => {
    expect(() => parseAmount('0.001')).toThrow(/decimal places/)
    expect(() => parseAmount('100.005')).toThrow(MoneyError)
  })
})

describe('toNumericString — writing back to Postgres', () => {
  it('emits a fixed-scale decimal string', () => {
    expect(toNumericString(350000)).toBe('3500.00')
    expect(toNumericString(1)).toBe('0.01')
    expect(toNumericString(0)).toBe('0.00')
  })

  it('round-trips through toMinor without drift', () => {
    for (const value of ['0.01', '99.99', '125000.00', '1.05']) {
      expect(toMinor(toNumericString(toMinor(value)))).toBe(toMinor(value))
    }
  })
})

describe('formatMinor — display', () => {
  it('uses South Asian digit grouping for BDT', () => {
    // en-BD gives 1,25,000 — the lakh grouping Bangladeshi users expect.
    const formatted = formatMinor(12500000)
    expect(formatted).toContain('1,25,000')
  })

  it('includes the currency symbol by default', () => {
    expect(formatMinor(350000)).toMatch(/[৳]/)
  })

  it('can omit the symbol', () => {
    expect(formatMinor(350000, { withSymbol: false })).not.toMatch(/[৳]/)
  })

  it('formats zero without NaN', () => {
    expect(formatMinor(0)).toContain('0')
  })

  it('rejects non-finite input instead of printing NaN', () => {
    expect(() => formatMinor(Number.NaN)).toThrow(MoneyError)
    expect(() => formatMinor(Number.POSITIVE_INFINITY)).toThrow(MoneyError)
  })
})

describe('formatSignedMinor — transaction lists', () => {
  it('prefixes income with + and expense with a true minus sign', () => {
    expect(formatSignedMinor(350000).startsWith('+')).toBe(true)
    expect(formatSignedMinor(-350000).startsWith('−')).toBe(true)
    // U+2212 MINUS SIGN, not a hyphen — keeps columns aligned.
    expect(formatSignedMinor(-350000).charAt(0)).toBe('−')
  })
})