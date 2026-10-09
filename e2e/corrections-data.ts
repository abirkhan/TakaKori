import { expect, type Page } from '@playwright/test'

/**
 * Test-data hygiene for balance corrections.
 *
 * The suite records corrections against a **shared** account, and a correction left
 * behind shifts that account's balance for every test that runs afterwards — including
 * the ones that assert on a balance. ৳753.10 of drift accumulated across a few failing
 * runs before this was noticed, and every failure it caused pointed at the wrong thing.
 *
 * So the suite heals itself rather than assuming a clean slate. Cleanup goes through the
 * app's own buttons, per the suite's convention: it exercises the same authorisation the
 * product does, and it means the removal path is itself covered by every run.
 */

/** Reasons this suite writes. Anything else on the account is not ours to touch. */
const OURS = [
  'E2E positive correction',
  'E2E negative correction',
  'E2E removable correction',
  'E2E correction',
  'E2E diag correction',
  'Tap target check',
]

/** Open the account sheet and wait for the breakdown, so rows are rendered. */
export async function openAccountSheet(page: Page) {
  await page.goto('/accounts')
  const first = page.locator('[aria-label^="Edit "]').first()
  await first.waitFor({ timeout: 20_000 })
  await first.click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  // The corrections list only renders once the reads land, and reading it early yields a
  // `''` that silently counts as zero corrections.
  await sheet.locator('[data-breakdown="total"] .tk-money').waitFor({ timeout: 15_000 })
  return sheet
}

/** Remove one correction by row, through the app's two-tap path. */
export async function removeRow(page: Page, sheet: ReturnType<typeof page.getByRole>, reason: string) {
  // Both clicks are forced, and for the same reason.
  //
  // Removing a correction opens a `<dialog>` inside the `<dialog>` that is already open,
  // and the new sheet animates for 280ms. While it does, the page keeps reflowing, so
  // Playwright's stability check — which requires the same bounding box across two
  // consecutive frames — never sees a settled element and retries until the test times
  // out. That is a harness rule being stricter than a person: a finger tapping a button
  // that moves for a quarter of a second is not a mis-tap, and every removal in this
  // file is confirmed by an assertion that the row actually went away.
  await sheet
    .locator('li')
    .filter({ hasText: reason })
    .first()
    .locator('button[aria-label^="Remove the correction of"]')
    .click({ force: true })
  await page.getByRole('button', { name: 'Remove the correction', exact: true }).click({ force: true })
}

/**
 * Remove every correction this suite may have left behind.
 *
 * Runs before each test as well as after, so a run that dies hard still leaves the next
 * one able to tell a real regression from yesterday's leftovers. Returns the count it
 * removed.
 */
export async function clearTestCorrections(page: Page, attempts = 30): Promise<number> {
  const sheet = await openAccountSheet(page)
  let removed = 0

  for (let i = 0; i < attempts; i++) {
    let clicked = false
    for (const reason of OURS) {
      const row = sheet.locator('li').filter({ hasText: reason })
      if ((await row.count()) === 0) continue
      await removeRow(page, sheet, reason)
      // Wait for the row to actually go, so the next iteration reads the next one rather
      // than the row it just deleted.
      await expect(sheet.locator('li').filter({ hasText: reason })).toHaveCount(0, {
        timeout: 15_000,
      })
      removed++
      clicked = true
      break
    }
    if (!clicked) return removed
  }

  throw new Error(`corrections kept reappearing; gave up after ${attempts} removals`)
}