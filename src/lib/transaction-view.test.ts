import { describe, expect, it } from 'vitest'
import { transactionSubtitle, type SubtitleSource } from './transaction-view'

/**
 * The subtitle is the only place a transaction row explains itself beyond its
 * title, and it lives at 13px in the narrowest column on the screen. Every case
 * below is a decision that was previously made twice, differently, on two
 * screens.
 */
function tx(over: Partial<SubtitleSource> = {}): SubtitleSource {
  return {
    description: null,
    type: 'expense',
    occurred_on: '2026-10-06',
    category: { name: 'Food' },
    account: { name: 'Cash' },
    counterparty_account: null,
    ...over,
  }
}

describe('transactionSubtitle', () => {
  it('names the destination for a transfer, not the source', () => {
    expect(
      transactionSubtitle(
        tx({
          type: 'transfer',
          description: 'Move to savings',
          counterparty_account: { name: 'Bank' },
        }),
      ),
    ).toBe('2026-10-06 · → Bank')
  })

  it('says so when a transfer has no destination on record', () => {
    expect(transactionSubtitle(tx({ type: 'transfer', counterparty_account: null }))).toBe(
      '2026-10-06 · → Unknown account',
    )
  })

  it('uses the category when a description already carries the title', () => {
    expect(transactionSubtitle(tx({ description: 'Lunch' }))).toBe('2026-10-06 · Food')
  })

  it('uses the account when the title is already the category', () => {
    // No description, so `title` renders as "Food". Repeating it in the subtitle
    // would say the same word twice; the account is the remaining context.
    expect(transactionSubtitle(tx({ description: null }))).toBe('2026-10-06 · Cash')
  })

  it('falls back to the bare date rather than a dangling separator', () => {
    expect(transactionSubtitle(tx({ description: 'Lunch', category: null }))).toBe('2026-10-06')
    expect(transactionSubtitle(tx({ description: null, account: null }))).toBe('2026-10-06')
  })

  it('never emits three parts, whatever it is given', () => {
    const cases = [
      tx({ description: 'Lunch' }),
      tx({ description: null }),
      tx({ type: 'transfer', counterparty_account: { name: 'Bank' } }),
      tx({ description: 'x', category: null, account: null }),
    ]
    for (const c of cases) {
      expect(transactionSubtitle(c).split(' · ')).toHaveLength(
        c.type === 'transfer' || c.description
          ? c.type === 'transfer' || c.category || c.counterparty_account
            ? 2
            : 1
          : c.account
            ? 2
            : 1,
      )
    }
  })
})
