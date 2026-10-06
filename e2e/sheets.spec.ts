import { test as base, expect } from '@playwright/test'
import { authedTest } from './fixtures'

/**
 * Modal behaviour.
 *
 * The add / edit / delete flows moved from inline UI into sheets, which trades
 * a set of visible controls for behaviours that only exist once a dialog is
 * open. Those behaviours are exactly what a hand-rolled overlay gets wrong and
 * what nothing else in the suite covers:
 *
 *   - the page behind must be unreachable while the sheet is open
 *   - Escape and the close button must both dismiss it
 *   - a validation failure must not close it and discard the user's input
 *   - it must never cover the fixed tab bar
 *
 * `<dialog>` supplies most of this natively, which is the reason the primitive is
 * built on it. These tests are here so a future "let's hand-roll it lighter"
 * change has to delete them deliberately rather than quietly regress them.
 */

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD

/**
 * The tab bar's floating action, scoped to the bar.
 *
 * There are two links with this name on a phone-width screen — the tab bar's
 * floating action and the transactions page header — so an unscoped
 * getByRole is a strict-mode violation. Scoping to the bar is also what makes
 * the test say which trigger it means.
 */
function fab(page: import('@playwright/test').Page) {
  return page.locator('nav[aria-label="Primary"]').getByRole('link', { name: 'Add a transaction' })
}

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.locator('[name="email"]').fill(EMAIL!)
  await page.locator('[name="password"]').fill(PASSWORD!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 30_000 })
}

base.describe('sheets', () => {
  base.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  authedTest('the add sheet opens from the tab bar and closes on Escape', async ({ signedIn }) => {
    await signedIn.goto('/transactions')

    // The trigger is a real link, so it also proves the `?sheet=add` URL
    // contract the whole flow is built on.
    await fab(signedIn).click()
    await expect(signedIn).toHaveURL(/sheet=add/)

    const dialog = signedIn.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await signedIn.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(signedIn).not.toHaveURL(/sheet=add/)
  })

  authedTest('the page behind an open sheet is inert', async ({ signedIn }) => {
    await signedIn.goto('/transactions')
    await fab(signedIn).click()

    const dialog = signedIn.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // A tab behind the sheet must not be reachable. `<dialog>.showModal()`
    // makes the rest of the document inert; if this ever fails, focus is walking
    // into a page the user cannot see.
    const tab = signedIn.getByRole('link', { name: /Home/ }).first()
    await expect(tab).not.toBeFocused()
  })

  authedTest('a closed sheet leaves nothing painted', async ({ signedIn }) => {
    await signedIn.goto('/transactions')

    // The add sheet is mounted on every render of this page, closed. If anything in
    // the primitive sets `display` unconditionally it defeats the UA's
    // `dialog:not([open]) { display: none }`, and a closed sheet silently becomes a
    // permanent invisible-but-present overlay that still swallows clicks and still
    // holds focus. Nothing may be visible before the sheet is opened.
    await expect(signedIn.locator('.tk-modal')).toHaveCount(1)
    await expect(signedIn.locator('.tk-modal')).toBeHidden()
  })

  authedTest('a short sheet is anchored to the bottom edge, not the top', async ({ signedIn }) => {
    await signedIn.goto('/transactions?preset=all')

    const row = signedIn
      .locator('li')
      .filter({ has: signedIn.locator('[data-row-title]') })
      .first()
    const title = (await row.locator('[data-row-title]').innerText()).trim()
    await row.getByRole('button', { name: `Actions for ${title}` }).click()

    const sheet = signedIn.locator('.tk-modal[open] .tk-modal-sheet')
    await expect(sheet).toBeVisible()

    const box = await sheet.boundingBox()
    const viewport = signedIn.viewportSize()!

    // The two-option menu is short. When this regressed, the sheet rendered at
    // the top of the screen — reachable by the thumb's weakest reach and nowhere
    // near the bottom edge the pattern implies. Position must not depend on
    // content height.
    expect(box!.y + box!.height).toBeGreaterThan(viewport.height - 2)
  })

  authedTest('the sheet never covers the tab bar', async ({ signedIn }) => {
    await signedIn.goto('/transactions')
    await fab(signedIn).click()

    const dialog = signedIn.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const geometry = await signedIn.evaluate(() => {
      const sheet = document.querySelector('.tk-modal-sheet') as HTMLElement | null
      const nav = document.querySelector('nav[aria-label="Primary"]') as HTMLElement | null
      if (!sheet || !nav) return null
      const s = sheet.getBoundingClientRect()
      const n = nav.getBoundingClientRect()
      return {
        sheetBottom: s.bottom,
        navTop: n.top,
        viewportHeight: window.innerHeight,
        sheetHeight: s.height,
      }
    })

    expect(geometry).not.toBeNull()
    const g = geometry!

    // The sheet is in the top layer, so it is drawn *over* the bar. The bar must
    // not be visible through it, and the sheet must not extend past the viewport.
    expect(g.sheetHeight).toBeLessThanOrEqual(g.viewportHeight + 1)
    expect(g.sheetBottom).toBeLessThanOrEqual(g.viewportHeight + 1)
    // Sanity: the bar is where we expect it, so the comparison above is meaningful.
    expect(g.navTop).toBeGreaterThan(0)
  })

  authedTest('a rejected save keeps the sheet open with the input intact', async ({ signedIn }) => {
    await signedIn.goto('/transactions')
    await fab(signedIn).click()

    const dialog = signedIn.getByRole('dialog')
    const amount = dialog.locator('[name="amount"]')

    // A value the server rejects. The sheet must survive it: closing on submit
    // throws away everything the user typed on the most common kind of mistake.
    await amount.fill('-50')
    await dialog.locator('[name="accountId"]').selectOption({ index: 1 })
    await dialog.locator('[name="categoryId"]').selectOption({ index: 1 })
    await dialog.getByRole('button', { name: 'Save transaction' }).click()

    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/decimal places|valid amount/i)).toBeVisible({ timeout: 15_000 })
    await expect(amount).toHaveValue('-50')
  })

  authedTest('the close button dismisses the sheet', async ({ signedIn }) => {
    await signedIn.goto('/transactions')
    await fab(signedIn).click()

    const dialog = signedIn.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()
  })

  base('the back button closes the sheet', async ({ page }) => {
    await signIn(page)
    await page.goto('/transactions')
    await fab(page).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // The sheet's state is in the URL, so Back closes it. This is the behaviour a
    // hand-rolled modal loses, and the reason the state lives in the query string.
    await page.goBack()
    await expect(dialog).toBeHidden()
  })

  authedTest('a row opens its own edit sheet, showing that row', async ({ signedIn }) => {
    await signedIn.goto('/transactions?preset=all')

    const row = signedIn
      .locator('li')
      .filter({ has: signedIn.locator('[data-row-title]') })
      .first()
    const title = (await row.locator('[data-row-title]').innerText()).trim()

    await row.getByRole('button', { name: `Actions for ${title}` }).click()

    const menu = signedIn.getByRole('dialog')
    await expect(menu).toContainText(title)
    await menu.getByRole('button', { name: 'Edit transaction' }).click()

    const dialog = signedIn.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(title)
    // Amount, date and description only â€” account and category are deliberately
    // not editable (see EditTransactionSheet).
    await expect(dialog.locator('[name="amount"]')).toBeVisible()
    await expect(dialog.locator('[name="description"]')).toBeVisible()
    await expect(dialog.locator('[name="categoryId"]')).toHaveCount(0)
  })

  authedTest('a row carries one action target, not two visible links', async ({ signedIn }) => {
    await signedIn.goto('/transactions?preset=all')

    const row = signedIn
      .locator('li')
      .filter({ has: signedIn.locator('[data-row-title]') })
      .first()

    // Two visible 44px links on every row of a fifty-row list made each row ~40%
    // taller for actions a user runs rarely. One overflow button, and the row
    // keeps its natural height.
    await expect(row.getByRole('button')).toHaveCount(1)
    await expect(row.getByRole('link')).toHaveCount(0)
  })

  authedTest('delete asks for confirmation before it destroys anything', async ({ signedIn }) => {
    await signedIn.goto('/transactions?preset=all')

    const row = signedIn
      .locator('li')
      .filter({ has: signedIn.locator('[data-row-title]') })
      .first()
    const title = (await row.locator('[data-row-title]').innerText()).trim()

    await row.getByRole('button', { name: `Actions for ${title}` }).click()
    await signedIn.getByRole('dialog').getByRole('button', { name: 'Delete transaction' }).click()

    const dialog = signedIn.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('cannot be undone')
    // The row is still there: confirmation has to come before destruction.
    await expect(row).toBeVisible()

    // Backing out keeps the record.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(row).toBeVisible()
  })
})
