import { describe, expect, it } from 'vitest'
import { transactionSubtitle, type SubtitleSource } from './transaction-view'

/**
 * The subtitle is the only place a transaction row explains itself beyond its
 * title, and it lives at 13px in the narrowest column on the screen. Every case
 * below is a decision that was previously made twice, differently, on two
 * screens.
 *
 * **The date is supplied, not read.** `transactionSubtitle` used to interpolate
 * `occurred_on` itself, which put `2026-10-09` on every row in the app. The caller
 * now passes the label, because only the caller holds the profile's timezone — and
 * a helper that resolved the day itself would either need it threaded in or would
 * silently use the device's, which is the bug `dates.ts` exists to prevent.
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

/** The dashboard's shape: the row carries its own date. */
const withDate = { dayLabel: 'Today' }
/** The transaction list's shape: a sticky day header above the rows already has it. */
const withoutDate = { dayLabel: null }

describe('transactionSubtitle', () => {
  it('names the destination for a transfer, not the source', () => {
    expect(
      transactionSubtitle(
        tx({
          type: 'transfer',
          description: 'Move to savings',
          counterparty_account: { name: 'Bank' },
        }),
        withDate,
      ),
    ).toBe('Today · → Bank')
  })

  it('says so when a transfer has no destination on record', () => {
    expect(
      transactionSubtitle(tx({ type: 'transfer', counterparty_account: null }), withDate),
    ).toBe('Today · → Unknown account')
  })

  it('uses the category when a description already carries the title', () => {
    expect(transactionSubtitle(tx({ description: 'Lunch' }), withDate)).toBe('Today · Food')
  })

  it('uses the account when the title is already the category', () => {
    // No description, so `title` renders as "Food". Repeating it in the subtitle
    // would say the same word twice; the account is the remaining context.
    expect(transactionSubtitle(tx({ description: null }), withDate)).toBe('Today · Cash')
  })

  it('falls back to the bare date rather than a dangling separator', () => {
    expect(transactionSubtitle(tx({ description: 'Lunch', category: null }), withDate)).toBe('Today')
    expect(transactionSubtitle(tx({ description: null, account: null }), withDate)).toBe('Today')
  })

  it('never emits three parts, whatever it is given', () => {
    const cases = [
      tx({ description: 'Lunch' }),
      tx({ description: null }),
      tx({ type: 'transfer', counterparty_account: { name: 'Bank' } }),
      tx({ description: 'x', category: null, account: null }),
    ]
    for (const c of cases) {
      expect(transactionSubtitle(c, withDate).split(' · ')).toHaveLength(
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

  /**
   * The regression this signature exists to prevent.
   *
   * A `null` day label once produced `· Food` and `Today · ` — a leading or
   * trailing separator, from interpolating the date and then trying to remove it
   * afterwards. The parts are joined once instead, so there is nothing to strip and
   * no separator can survive without a part on both sides of it.
   */
  it('omits the date cleanly when the screen already shows it', () => {
    expect(transactionSubtitle(tx({ description: 'Lunch' }), withoutDate)).toBe('Food')
    expect(
      transactionSubtitle(
        tx({ type: 'transfer', counterparty_account: { name: 'Bank' } }),
        withoutDate,
      ),
    ).toBe('→ Bank')
    expect(transactionSubtitle(tx({ description: null }), withoutDate)).toBe('Cash')
  })

  it('produces no bare separator when there is nothing left to say', () => {
    // Neither a date nor a label: an empty string, not "·" and not " · ".
    expect(transactionSubtitle(tx({ description: 'Lunch', category: null }), withoutDate)).toBe('')
    expect(transactionSubtitle(tx({ description: null, account: null }), withoutDate)).toBe('')
  })
})
