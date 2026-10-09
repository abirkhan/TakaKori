import { test as base, expect } from '@playwright/test'
import { authedTest } from './fixtures'
import { clearTestCorrections, openAccountSheet, removeRow } from './corrections-data'

/**
 * Correcting an account balance.
 *
 * The interesting properties here are the ones that fail *quietly*. A correction that
 * does not post throws and is obvious; one that posts against the wrong account, or that
 * moves the balance without leaving a row behind, looks entirely plausible on screen. So
 * the assertions are about reconciliation — the balance against the parts the breakdown
 * attributes it to — rather than about a figure appearing.
 *
 * Every test starts by clearing anything a previous run left behind. These tests share
 * one account with the rest of the suite, and a correction left behind shifts its balance
 * for everything that runs next. The first version of this file could not clean up (the
 * app had no undo for a correction) and the account drifted ৳753.10 before that was
 * noticed; 17 rows had accumulated by the time the undo existed. See
 * `corrections-data.ts`.
 */

base.describe('account corrections', () => {
  base.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  /**
   * Wait for the breakdown to carry real figures, then read them.
   *
   * Located by `data-breakdown`, never by the text. These are formatted money strings —
   * `৳ 2,536.00`, with a U+2212 minus and South Asian grouping — so reading one back
   * means stripping a symbol and separators before it can be compared to a number. That
   * parsing is exactly where a formatting change would turn into a spurious balance
   * failure, or hide a real one.
   */
  async function breakdown(page: import('@playwright/test').Page) {
    const sheet = page.getByRole('dialog')
    const total = sheet.locator('[data-breakdown="total"] .tk-money')
    await expect(total).toContainText('৳', { timeout: 15_000 })

    const read = async (name: string) => {
      const value = sheet.locator(
        `[data-breakdown="${name}"] .tk-money, [data-breakdown="${name}"] .tk-amount-muted`,
      )
      // The Corrections line only exists when there is one, so absent means zero.
      if ((await value.count()) === 0) return 0
      const text = (await value.innerText()).trim()
      // U+2212 MINUS SIGN, not a hyphen — `formatMinor` deliberately uses it so negative
      // amounts align in a monospace column. A test matching '-' would silently read a
      // negative as positive.
      const negative = text.includes('−')
      const digits = text.replace(/[^0-9.]/g, '')
      return (negative ? -1 : 1) * Math.round(Number(digits) * 100)
    }
    return {
      total: await read('total'),
      opening: await read('Opening balance'),
      fromTransactions: await read('From transactions'),
      corrections: await read('Corrections'),
    }
  }

  /**
   * Wait for a correction to land in the balance.
   *
   * The row appearing is **not** the balance moving. Recording invalidates the
   * `accounts:` prefix and the balance is then re-read over the network — measured at
   * roughly a second. A test that reads the total as soon as the row is visible gets the
   * pre-write figure and concludes the correction did nothing, which is what the first
   * two versions of this file did.
   *
   * Polling the *value* rather than sleeping: a sleep long enough for a slow run is a
   * long sleep on every run, and one tuned to this machine's dev server is not a test.
   */
  async function expectBalanceToSettle(page: import('@playwright/test').Page, expected: number) {
    await expect
      .poll(async () => (await breakdown(page)).total, {
        timeout: 20_000,
        message: `balance never reached ${expected}`,
      })
      .toBe(expected)
  }

  authedTest('the sheet shows where a balance comes from', async ({ signedIn }) => {
    await clearTestCorrections(signedIn)
    const sheet = await openAccountSheet(signedIn)

    // By role, not by text: the loading placeholder reads "Working out where this balance
    // comes from…", so a text match is ambiguous between the heading and the placeholder.
    await expect(sheet.getByRole('heading', { name: 'Where this balance comes from' })).toBeVisible()

    const { total, opening, fromTransactions, corrections } = await breakdown(signedIn)

    // The property the whole component exists to make visible: the parts add up to the
    // total, exactly. If they do not, the user is looking at two numbers that disagree
    // and no explanation for which to trust.
    expect(total).toBe(opening + fromTransactions + corrections)
  })

  authedTest('the opening balance is not offered as an editable field', async ({ signedIn }) => {
    await clearTestCorrections(signedIn)
    const sheet = await openAccountSheet(signedIn)

    /**
     * The regression this pins.
     *
     * The field used to be pre-filled from the account row, so on an account with a real
     * transaction behind it it showed `opening_balance` next to a row reading the actual
     * balance. The one input offering to correct a balance held the one number that was
     * not the balance.
     */
    await expect(sheet.locator('[name="openingBalance"]')).toHaveCount(0)
    // The correction is the replacement, and it is signed.
    await expect(sheet.locator('[name="amount"]')).toBeVisible()
  })

  authedTest('a recorded correction moves the balance and leaves a row behind', async ({ signedIn }) => {
    await clearTestCorrections(signedIn)
    const sheet = await openAccountSheet(signedIn)
    const before = await breakdown(signedIn)

    await sheet.locator('[name="amount"]').fill('123.45')
    await sheet.locator('[name="reason"]').fill('E2E positive correction')
    await sheet.getByRole('button', { name: 'Record correction' }).click()

    // Recorded as a row, which is what makes it visible and reversible.
    await expect(sheet.getByText('E2E positive correction')).toBeVisible({ timeout: 15_000 })
    await expectBalanceToSettle(signedIn, before.total + 12345)

    const after = await breakdown(signedIn)
    expect(after.total - before.total).toBe(12345)
    // The balance moved *because of the correction*, not because of a transaction — so
    // the corrections line takes the whole difference.
    expect(after.corrections - before.corrections).toBe(12345)
    expect(after.fromTransactions).toBe(before.fromTransactions)

    // The draft is cleared, so the posted figure cannot be submitted a second time.
    await expect(sheet.locator('[name="amount"]')).toHaveValue('')
  })

  authedTest('a negative correction reduces the balance', async ({ signedIn }) => {
    await clearTestCorrections(signedIn)
    const sheet = await openAccountSheet(signedIn)
    const before = await breakdown(signedIn)

    await sheet.locator('[name="amount"]').fill('-500')
    await sheet.locator('[name="reason"]').fill('E2E negative correction')
    await sheet.getByRole('button', { name: 'Record correction' }).click()
    await expect(sheet.getByText('E2E negative correction')).toBeVisible({ timeout: 15_000 })
    await expectBalanceToSettle(signedIn, before.total - 50000)

    const after = await breakdown(signedIn)
    // A downward correction has to be expressible. A positive-only field would make "I
    // overstated this by 500" impossible to record at all.
    expect(after.total - before.total).toBe(-50000)
    expect(after.corrections - before.corrections).toBe(-50000)
  })

  authedTest('a removed correction puts the balance back', async ({ signedIn }) => {
    await clearTestCorrections(signedIn)
    const sheet = await openAccountSheet(signedIn)
    const before = await breakdown(signedIn)

    await sheet.locator('[name="amount"]').fill('321')
    await sheet.locator('[name="reason"]').fill('E2E removable correction')
    await sheet.getByRole('button', { name: 'Record correction' }).click()
    await expect(sheet.getByText('E2E removable correction')).toBeVisible({ timeout: 15_000 })
    await expectBalanceToSettle(signedIn, before.total + 32100)

    const posted = await breakdown(signedIn)
    expect(posted.total - before.total).toBe(32100)

    // A correction exists to fix a mistake. A fix that cannot itself be undone is a worse
    // position than the silent column edit it replaced — that one at least could be
    // re-typed.
    await removeRow(signedIn, sheet, 'E2E removable correction')
    await expectBalanceToSettle(signedIn, before.total)

    const restored = await breakdown(signedIn)
    expect(restored.total).toBe(before.total)
    expect(restored.corrections).toBe(before.corrections)
  })

  authedTest('a zero correction is refused rather than stored', async ({ signedIn }) => {
    await clearTestCorrections(signedIn)
    const sheet = await openAccountSheet(signedIn)

    await sheet.locator('[name="amount"]').fill('0')
    await sheet.getByRole('button', { name: 'Record correction' }).click()

    // It would sit in the ledger looking like a record while changing nothing.
    await expect(sheet.getByText(/would not change/i)).toBeVisible({ timeout: 15_000 })
    await expect(sheet.locator('[name="amount"]')).toHaveValue('0')
  })

  authedTest('a rejected correction keeps the typed amount', async ({ signedIn }) => {
    await clearTestCorrections(signedIn)
    const sheet = await openAccountSheet(signedIn)

    await sheet.locator('[name="amount"]').fill('1.005')
    await sheet.getByRole('button', { name: 'Record correction' }).click()

    // Three places cannot be stored exactly in numeric(14,2), and a value quietly
    // rounded is a balance that no longer reconciles with what the user typed — so the
    // user must be able to see it and fix it.
    await expect(sheet.getByText(/decimal places/i).first()).toBeVisible({ timeout: 15_000 })
    await expect(sheet.locator('[name="amount"]')).toHaveValue('1.005')
  })
})