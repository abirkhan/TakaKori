import { test as base, expect } from '@playwright/test'
import { authedTest } from './fixtures'

/**
 * Correcting an account balance.
 *
 * The interesting properties here are the ones that fail *quietly*. A correction that
 * does not post throws and is obvious; one that posts against the wrong account, or that
 * moves the balance without leaving a row behind, looks entirely plausible on screen.
 * So the assertions are about reconciliation — the balance against the parts the
 * breakdown attributes it to — rather than about a figure appearing.
 *
 * Every test that records a correction removes it again, through the app's own Remove
 * button. That is not tidiness: these tests share one account with the rest of the
 * suite, and a correction left behind shifts its balance for every test that runs after
 * it. The first version of this file could not clean up — the app had no undo for a
 * correction — and the shared account drifted ৳753.10 across a few runs before it was
 * noticed.
 */

base.describe('account corrections', () => {
  base.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  /** The first account row's Edit button, by the aria-label the row carries. */
  function editFirstAccount(page: import('@playwright/test').Page) {
    return page.locator('[aria-label^="Edit "]').first()
  }

  /** Open the sheet on the first account and wait for it. */
  async function openFirstAccount(page: import('@playwright/test').Page) {
    await page.goto('/accounts')
    await editFirstAccount(page).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    return sheet
  }

  /**
   * Wait for the breakdown to carry real figures, then read them.
   *
   * The wait is load-bearing, and its absence is a trap worth recording. The breakdown
   * resolves three queries (profile, balances, adjustments) and shows a placeholder
   * until they land. Read before then it yields `''`, `Number('') === 0`, and a test
   * asserting on the *difference* between two reads gets `0` — which looks exactly like
   * "the correction did nothing". The first version of this file did that and reported a
   * working feature as broken.
   */
  async function breakdown(page: import('@playwright/test').Page) {
    const sheet = page.getByRole('dialog')
    const total = sheet.locator('[data-breakdown="total"] .tk-money')
    await expect(total).toContainText('৳', { timeout: 15_000 })

    const read = async (name: string) => {
      const value = sheet.locator(
        `[data-breakdown="${name}"] .tk-money, [data-breakdown="${name}"] .tk-amount-muted`,
      )
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
   * Remove corrections, through the app's own Remove button.
   *
   * `reason` narrows it to one row, so a test removes what it added and leaves anything
   * already there. It matches on the *reason*, scoped to the list item — not on the
   * button's accessible name, which is built from the amount because reasons repeat and
   * two identically-named controls in one list cannot be told apart.
   *
   * `exact: true` on the confirm button matters: without it the substring match also
   * hits every row's Remove button, which is a strict-mode violation that fails on the
   * wrong element rather than on the missing one.
   */
  async function removeCorrections(page: import('@playwright/test').Page, reason: string) {
    const sheet = page.getByRole('dialog')
    for (let i = 0; i < 12; i++) {
      const row = sheet.locator('li').filter({ hasText: reason }).first()
      if ((await row.count()) === 0) return
      await row.locator('button[aria-label^="Remove the correction of"]').click()
      const confirm = page
        .getByRole('dialog')
        .getByRole('button', { name: 'Remove the correction', exact: true })
      await confirm.click()
      // Asserted on the confirm button, not on `getByRole('dialog')`: while the confirm
      // sheet is open there are *two* dialogs, so a hidden-check on the dialog role is a
      // strict-mode violation that fails on the wrong thing. The button only ever exists
      // in the sheet being dismissed.
      await expect(confirm).toBeHidden({ timeout: 15_000 })
      await expect(sheet.locator('li').filter({ hasText: reason })).toHaveCount(0, {
        timeout: 15_000,
      })
    }
    throw new Error(`Correction "${reason}" kept reappearing; gave up after 12 removals`)
  }

  authedTest('the sheet shows where a balance comes from', async ({ signedIn }) => {
    const sheet = await openFirstAccount(signedIn)

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
    const sheet = await openFirstAccount(signedIn)

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
    const sheet = await openFirstAccount(signedIn)
    const before = await breakdown(signedIn)

    await sheet.locator('[name="amount"]').fill('123.45')
    await sheet.locator('[name="reason"]').fill('E2E positive correction')
    await sheet.getByRole('button', { name: 'Record correction' }).click()

    // Recorded as a row, which is what makes it visible and reversible.
    await expect(sheet.getByText('E2E positive correction')).toBeVisible({ timeout: 15_000 })

    const after = await breakdown(signedIn)
    expect(after.total - before.total).toBe(12345)
    // The balance moved *because of the correction*, not because of a transaction — so
    // the corrections line takes the whole difference.
    expect(after.corrections - before.corrections).toBe(12345)
    expect(after.fromTransactions).toBe(before.fromTransactions)

    // The draft is cleared, so the posted figure cannot be submitted a second time.
    await expect(sheet.locator('[name="amount"]')).toHaveValue('')

    await removeCorrections(signedIn, 'E2E positive correction')
  })

  authedTest('a negative correction reduces the balance', async ({ signedIn }) => {
    const sheet = await openFirstAccount(signedIn)
    const before = await breakdown(signedIn)

    await sheet.locator('[name="amount"]').fill('-500')
    await sheet.locator('[name="reason"]').fill('E2E negative correction')
    await sheet.getByRole('button', { name: 'Record correction' }).click()
    await expect(sheet.getByText('E2E negative correction')).toBeVisible({ timeout: 15_000 })

    const after = await breakdown(signedIn)
    // A downward correction has to be expressible. A positive-only field would make "I
    // overstated this by 500" impossible to record at all.
    expect(after.total - before.total).toBe(-50000)
    expect(after.corrections - before.corrections).toBe(-50000)

    await removeCorrections(signedIn, 'E2E negative correction')
  })

  authedTest('a removed correction puts the balance back', async ({ signedIn }) => {
    const sheet = await openFirstAccount(signedIn)
    const before = await breakdown(signedIn)

    await sheet.locator('[name="amount"]').fill('321')
    await sheet.locator('[name="reason"]').fill('E2E removable correction')
    await sheet.getByRole('button', { name: 'Record correction' }).click()
    await expect(sheet.getByText('E2E removable correction')).toBeVisible({ timeout: 15_000 })

    const posted = await breakdown(signedIn)
    expect(posted.total - before.total).toBe(32100)

    // A correction exists to fix a mistake. A fix that cannot itself be undone is a worse
    // position than the silent column edit it replaced — that one at least could be
    // re-typed.
    await removeCorrections(signedIn, 'E2E removable correction')

    const restored = await breakdown(signedIn)
    expect(restored.total).toBe(before.total)
    expect(restored.corrections).toBe(before.corrections)
  })

  authedTest('a zero correction is refused rather than stored', async ({ signedIn }) => {
    const sheet = await openFirstAccount(signedIn)

    await sheet.locator('[name="amount"]').fill('0')
    await sheet.getByRole('button', { name: 'Record correction' }).click()

    // It would sit in the ledger looking like a record while changing nothing.
    await expect(sheet.getByText(/would not change/i)).toBeVisible({ timeout: 15_000 })
    await expect(sheet.locator('[name="amount"]')).toHaveValue('0')
  })

  authedTest('a rejected correction keeps the typed amount', async ({ signedIn }) => {
    const sheet = await openFirstAccount(signedIn)

    await sheet.locator('[name="amount"]').fill('1.005')
    await sheet.getByRole('button', { name: 'Record correction' }).click()

    // Three places cannot be stored exactly in numeric(14,2), and a value quietly
    // rounded is a balance that no longer reconciles with what the user typed — so the
    // user must be able to see it and fix it.
    const error = sheet.locator('[name="amount"]')
    await expect(sheet.getByText(/decimal places/i).first()).toBeVisible({ timeout: 15_000 })
    await expect(error).toHaveValue('1.005')
  })
})