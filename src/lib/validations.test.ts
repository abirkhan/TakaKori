import { describe, it, expect } from 'vitest'
import {
  createTransactionSchema,
  amountInputSchema,
  isoDateSchema,
  uuidSchema,
} from '@/lib/validations'

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111'
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222'
const CATEGORY = '33333333-3333-4333-8333-333333333333'

const base = {
  amount: '500.50',
  accountId: ACCOUNT_A,
  occurredOn: '2026-09-30',
}

describe('amountInputSchema', () => {
  it('accepts plain and 2-decimal amounts', () => {
    expect(amountInputSchema.safeParse('500').success).toBe(true)
    expect(amountInputSchema.safeParse('500.50').success).toBe(true)
    expect(amountInputSchema.safeParse('0.01').success).toBe(true)
  })

  it('rejects zero and negatives', () => {
    expect(amountInputSchema.safeParse('0').success).toBe(false)
    expect(amountInputSchema.safeParse('0.00').success).toBe(false)
    expect(amountInputSchema.safeParse('-5').success).toBe(false)
  })

  it('rejects more than 2 decimal places', () => {
    expect(amountInputSchema.safeParse('0.001').success).toBe(false)
    expect(amountInputSchema.safeParse('100.999').success).toBe(false)
  })

  it('rejects exponent notation and separators', () => {
    // Number("1e3") === 1000, which would silently accept scientific input.
    expect(amountInputSchema.safeParse('1e3').success).toBe(false)
    expect(amountInputSchema.safeParse('1,000').success).toBe(false)
    expect(amountInputSchema.safeParse(' 100 ').success).toBe(true) // trimmed
  })
})

describe('isoDateSchema', () => {
  it('accepts a real calendar date', () => {
    expect(isoDateSchema.safeParse('2026-09-30').success).toBe(true)
    expect(isoDateSchema.safeParse('2028-02-29').success).toBe(true)
  })

  it('rejects other formats rather than guessing', () => {
    expect(isoDateSchema.safeParse('30/09/2026').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-9-3').success).toBe(false)
    expect(isoDateSchema.safeParse('30-09-2026').success).toBe(false)
  })

  it('rejects impossible dates', () => {
    expect(isoDateSchema.safeParse('2026-02-30').success).toBe(false)
    expect(isoDateSchema.safeParse('2027-02-29').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-04-31').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-13-01').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-00-10').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-01-32').success).toBe(false)
  })

  it('does not rely on Date.parse, which rolls impossible dates forward', () => {
    // Date.parse('2026-02-30') returns a valid timestamp for 2026-03-02.
    // A naive isNaN check would accept a date the user never intended.
    expect(Number.isNaN(Date.parse('2026-02-30T00:00:00Z'))).toBe(false)
    expect(isoDateSchema.safeParse('2026-02-30').success).toBe(false)
  })
})

describe('uuidSchema', () => {
  it('rejects a non-UUID id', () => {
    // Guards against injection through an id parameter.
    expect(uuidSchema.safeParse("1' OR '1'='1").success).toBe(false)
    expect(uuidSchema.safeParse('abc').success).toBe(false)
  })
})

describe('createTransactionSchema — income and expense', () => {
  it('accepts an income with a category', () => {
    const result = createTransactionSchema.safeParse({
      ...base,
      type: 'income',
      categoryId: CATEGORY,
    })
    expect(result.success).toBe(true)
  })

  it('requires a category for income and expense', () => {
    const result = createTransactionSchema.safeParse({ ...base, type: 'expense' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'categoryId')).toBe(true)
    }
  })

  it('rejects a destination account on a non-transfer', () => {
    const result = createTransactionSchema.safeParse({
      ...base,
      type: 'expense',
      categoryId: CATEGORY,
      counterpartyAccountId: ACCOUNT_B,
    })
    expect(result.success).toBe(false)
  })
})

describe('createTransactionSchema — transfers', () => {
  it('accepts a transfer with two distinct accounts', () => {
    const result = createTransactionSchema.safeParse({
      ...base,
      type: 'transfer',
      accountId: ACCOUNT_A,
      counterpartyAccountId: ACCOUNT_B,
    })
    expect(result.success).toBe(true)
  })

  it('requires a destination account', () => {
    const result = createTransactionSchema.safeParse({ ...base, type: 'transfer' })
    expect(result.success).toBe(false)
  })

  it('rejects a transfer to the same account', () => {
    const result = createTransactionSchema.safeParse({
      ...base,
      type: 'transfer',
      counterpartyAccountId: ACCOUNT_A,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes('different accounts')),
      ).toBe(true)
    }
  })

  it('rejects a transfer carrying a category', () => {
    const result = createTransactionSchema.safeParse({
      ...base,
      type: 'transfer',
      counterpartyAccountId: ACCOUNT_B,
      categoryId: CATEGORY,
    })
    expect(result.success).toBe(false)
  })
})