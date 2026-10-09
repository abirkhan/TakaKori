import { test as base, expect, type Page } from '@playwright/test'
import { authedTest, MARKER } from './fixtures'

/**
 * Offline writes, driven by actually cutting the network.
 *
 * **This was believed impossible from a dev machine, and it is not.** The earlier note
 * said offline behaviour could not be verified here. That was wrong: Playwright's
 * `context.setOffline()` emulates the browser losing the network and firing `online`
 * when it returns — which is exactly the two transitions this feature turns on,
 * `useOffline()` in `useWriteAction` and `useOutboxDrain`'s `online` listener.
 *
 * **No service worker is involved, and that is deliberate.** These tests stay on one
 * already-loaded page. They never navigate while the network is down, because there is
 * no worker in development and a navigation offline is `ERR_INTERNET_DISCONNECTED`.
 * What is under test is the outbox, not the cache.
 *
 * **The properties asserted are the ones that fail quietly.** A queued write that never
 * drains looks identical to one that was never queued. So the tests assert the round
 * trip — recorded offline, present on the server afterwards — rather than that the queue
 * accepted it, which is the easy half and passes on its own.
 */

/** The row count of marked transactions, read from the export. */
async function markedCount(page: Page): Promise<number> {
  const response = await page.request.get('/api/export/csv')
  if (!response.ok()) throw new Error(`CSV export returned ${response.status()}`)
  const body = await response.text()
  return body.split('\n').filter((line) => line.includes(MARKER)).length
}

/**
 * Cut the network, and wait for the app to agree that it is down.
 *
 * Without the wait a submit can race the `offline` event and land online, which reads
 * as a passing test that tested nothing.
 */
async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true)
  await expect
    .poll(async () => page.evaluate(() => navigator.onLine), { timeout: 10_000 })
    .toBe(false)
}

/**
 * Record an expense through the sheet, losing the signal mid-form.
 *
 * **The sheet is opened while online, on purpose.** The trigger is a `<Link>` to
 * `?sheet=add`, so opening it is a client-side navigation and needs to fetch an RSC
 * payload — which fails offline in development, where there is no service worker. That
 * is also the realistic order: you open the form, the lift doors close, you fill it in
 * and press save.
 */
async function queueExpense(page: Page, amount: string, description: string): Promise<void> {
  await page
    .locator('nav[aria-label="Primary"]')
    .getByRole('link', { name: 'Add a transaction' })
    .click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()

  /**
   * Account and category are required, and choosing them needs no network. They are set
   * while still online so the failure under test is the *write*, not a validation error:
   * the first version omitted them, the action rejected the submit with a field error,
   * nothing was ever queued, and the test failed looking like an outbox bug.
   */
  await sheet.locator('[name="accountId"]').selectOption({ label: 'Cash' })
  await sheet.locator('[name="categoryId"]').selectOption({ label: 'Food' })

  // The lift doors close here.
  await goOffline(page)

  await sheet.locator('[name="amount"]').fill(amount)
  await sheet.locator('[name="description"]').fill(description)
  await sheet.getByRole('button', { name: 'Save transaction' }).click()

  // ADR-043: the entry is *not* saved, it is saved on this device. A "Saved" here
  // would claim a durability IndexedDB cannot promise.
  await expect(page.getByText('Saved on this device').first()).toBeVisible({ timeout: 15_000 })
}

base.describe('offline writes', () => {
  base.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  authedTest('a transaction recorded offline reaches the server on reconnect', async ({
    signedIn,
  }) => {
    await signedIn.goto('/transactions?preset=all')
    const before = await markedCount(signedIn)

    await queueExpense(signedIn, '321.45', `${MARKER} offline expense`)

    // Nothing has reached the server yet. Asserting only the queue would pass even if
    // the write had gone straight through and the label were lying.
    expect(await markedCount(signedIn), 'a queued write reached the server while offline').toBe(
      before,
    )
    expect(await signedIn.evaluate(() => navigator.onLine)).toBe(false)

    await signedIn.context().setOffline(false)

    // The whole point: it arrives.
    await expect.poll(async () => markedCount(signedIn), { timeout: 40_000 }).toBe(before + 1)

    // And the pending row clears, so the queue does not teach users the label is
    // decoration. A row that never clears is worse than no row.
    await expect(signedIn.getByText('Saved on this device')).toHaveCount(0, { timeout: 25_000 })
  })

  /**
   * A parked write, seeded straight into the outbox.
   *
   * The kind is one this build cannot replay, so `applyQueuedWrite` returns a permanent
   * failure on the first drain and the row parks — which is exactly the state under
   * test, reached without needing a network to be down.
   */
  async function seedParkedWrite(page: Page, id: string, name: string): Promise<void> {
    await page.evaluate(
      async ({ id, name }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const open = indexedDB.open('takakori', 1)
          open.onsuccess = () => resolve(open.result)
          open.onerror = () => reject(open.error)
        })
        const tx = db.transaction('outbox', 'readwrite')
        // `permanentFailure` is set so the drain skips it rather than retrying; the
        // first pass sets it, and this asserts the parked *UI*, not the drain.
        tx.objectStore('outbox').put({
          id,
          kind: 'category.create',
          payload: { name, type: 'expense' },
          queuedAt: Date.now(),
          status: 'failed',
          failure: 'You already have an expense category called this.',
          attempts: 1,
          permanentFailure: true,
        })
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
      },
      { id, name },
    )
  }

  authedTest('a queued write is visible from a screen that is not Transactions', async ({
    signedIn,
  }) => {
    /**
     * The regression.
     *
     * `PendingWrites` rendered only inside `/transactions`. Nine of the ten queueable
     * writes are not transactions — a category, a budget, a recurring rule — so a user
     * who queued one on /categories and then found it rejected had to guess that the
     * answer lived on a different screen. A parked row they could not *see* was still a
     * dead end, whatever its discard button said.
     *
     * Seeded rather than produced by going offline, because the only way to see another
     * screen while offline is a navigation, and in development that fails without a
     * service worker. Placement is what is under test, not connectivity.
     */
    await signedIn.goto('/accounts')
    await seedParkedWrite(signedIn, 'e2e-parked-visibility', 'E2E parked visibility')

    const parked = signedIn.getByRole('region', { name: 'Waiting to sync' })
    await expect(parked).toBeVisible({ timeout: 15_000 })
    await expect(parked.getByText('E2E parked visibility')).toBeVisible()
    // The remedy is here too. A row the user can see but not act on is half a fix.
    await expect(parked.getByRole('button', { name: /Discard this entry/ })).toBeVisible()

    await parked.getByRole('button', { name: /Discard this entry/ }).click()
    await expect(parked).toHaveCount(0, { timeout: 15_000 })
  })

  /**
   * The permanent-failure path, through the real UI.
   *
   * A duplicate category name is the case the outbox's own comment names: a failure
   * that will never succeed on its own, and therefore the one where a queue without an
   * escape hatch is a dead end. It is also the only permanent failure reachable through
   * a form, which makes it the one worth automating.
   */
  authedTest('a queued category that duplicates an existing one parks, and can be discarded', async ({
    signedIn,
  }) => {
    const name = `E2E dup ${Date.now()}`

    // Create it, so the duplicate is guaranteed rather than hoped for.
    await signedIn.goto('/categories')
    const form = signedIn.locator('form').filter({ hasText: 'Add category' })
    await form.locator('[name="name"]').fill(name)
    await form.getByRole('button', { name: 'Add' }).click()
    await expect(signedIn.getByText(name).first()).toBeVisible({ timeout: 20_000 })

    // Now queue the same name while offline. `type` is a SegmentedControl, not a
    // select, and it already defaults to expense — so there is nothing to set.
    await goOffline(signedIn)
    await form.locator('[name="name"]').fill(name)
    await form.getByRole('button', { name: 'Add' }).click()
    await expect(signedIn.getByText('Saved on this device').first()).toBeVisible({
      timeout: 15_000,
    })

    await signedIn.context().setOffline(false)

    const parked = signedIn.getByRole('region', { name: 'Waiting to sync' })
    await expect(parked.getByRole('button', { name: /Discard this entry/ })).toBeVisible({
      timeout: 40_000,
    })
    // The reason names the thing that conflicts, so the user knows to rename. A generic
    // apology, or worse a spurious success, tells them nothing.
    await expect(parked).toContainText(/already uses that name/i)

    await parked.getByRole('button', { name: /Discard this entry/ }).click()
    await expect(parked).toHaveCount(0, { timeout: 15_000 })

    // Remove the category the test created, through the app.
    await signedIn.goto('/categories')
    const row = signedIn.locator('li').filter({ hasText: name }).first()
    if ((await row.count()) > 0) {
      await row.getByRole('button', { name: new RegExp(`^Edit`) }).click()
      const sheet = signedIn.getByRole('dialog')
      await expect(sheet).toBeVisible()
      await sheet.getByRole('button', { name: /Remove|Delete/ }).click()
      const confirm = signedIn.getByRole('dialog')
      await expect(confirm).toBeVisible()
      await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
    }
  })
})