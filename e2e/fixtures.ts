import { test as base, expect } from '@playwright/test'

/**
 * E2E fixtures.
 *
 * These tests run against a real Supabase project rather than a mock, because
 * the failure modes worth catching live exactly where a mock hides them:
 * cookie session refresh in proxy.ts, RLS on a real connection, Server Action
 * round-trips, and money formatting off the wire.
 *
 * Cleanup uses the product's own delete control rather than a privileged script
 * or a test-only HTTP route. A route that deletes rows on request is a live
 * vulnerability waiting to be discovered, and test-only endpoints have a habit
 * of outliving the tests that needed them. Going through the UI also means the
 * delete path itself is exercised on every run.
 *
 * Credentials live in .env.test, which is gitignored.
 */

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD
const MARKER = process.env.E2E_MARKER ?? 'e2e-test'

if (!EMAIL || !PASSWORD) {
  throw new Error(
    'E2E_EMAIL and E2E_PASSWORD must be set in .env.test. See .env.test.example. ' +
      'The suite needs a throwaway account with at least two accounts so the ' +
      'transfer test can move money between them.',
  )
}

/**
 * Remove every transaction this suite created, via the app's own delete button.
 *
 * First asks the CSV export endpoint whether any marked rows exist at all. That
 * request does not touch the page, so read-only tests finish without navigating
 * anywhere — which matters, because a navigation in flight from a previous
 * test's teardown was landing on the next test's page and corrupting its URL
 * assertions.
 */
async function removeMarkedTransactions(page: import('@playwright/test').Page): Promise<void> {
  if ((await countMarkedRows(page)) === 0) return

  await page.goto('/transactions?preset=all')

  /**
   * `li`, not `tr`: the transaction list is a card of rows rather than a table,
   * because a seven-column table is unusable at 390px.
   *
   * Anchored on `[data-row-title]`, which `Row` emits only for a transaction's
   * description. Matching on the row's whole text instead counts a transaction
   * more than once, so the cleanup loop deletes rows it never created and then
   * fails on a count that cannot reach zero. `has:` also requires the attribute
   * to be an exact match, so a marker that is a prefix of another row's
   * description does not pull that row in. Keep this in step with
   * `src/components/transactions/TransactionList.tsx`.
   */
  const marked = page.locator('li').filter({
    has: page.locator(`[data-row-title="${MARKER}"]`),
  })

  // Bounded so a delete that silently fails fails the test rather than hanging.
  for (let guard = 0; guard < 25; guard++) {
    const remaining = await marked.count()
    if (remaining === 0) return

    const row = marked.first()
    const title = (await row.locator('[data-row-title]').innerText()).trim()

    // Two sheets sit between the row and the delete: the row's action menu, then
    // the confirmation. That is the right friction for an irreversible action on
    // a financial record, and each sheet exists only while it is open — so this
    // has to walk the same path a user walks rather than poking at a button that
    // would be in the DOM unconditionally.
    await row.getByRole('button', { name: `Actions for ${title}` }).click()

    const menu = page.getByRole('dialog')
    await menu.waitFor({ state: 'visible' })
    await menu.getByRole('button', { name: 'Delete transaction' }).click()

    const confirm = page.getByRole('dialog')
    await confirm.waitFor({ state: 'visible' })
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(marked).toHaveCount(remaining - 1, { timeout: 15_000 })
  }

  // Throwing matters here: returning quietly would hand a dirty account to the
  // next test, where it surfaces as an unrelated failure.
  throw new Error(`Could not remove every row marked "${MARKER}"`)
}

/**
 * How many transactions the suite has left behind, read from the CSV export.
 *
 * The export already returns every row the signed-in user can see, so this needs
 * no page navigation and no privileged key.
 */
async function countMarkedRows(page: import('@playwright/test').Page): Promise<number> {
  const response = await page.request.get('/api/export/csv')
  if (!response.ok()) {
    throw new Error(`CSV export returned ${response.status()}; cannot check for leftover rows`)
  }

  const body = await response.text()
  return body.split('\n').filter((line) => line.includes(MARKER)).length
}

/** Sign in, then hand the page to the test. No cleanup: for read-only tests. */
export const authedTest = base.extend<{ signedIn: import('@playwright/test').Page }>({
  // The second parameter is Playwright's `use` callback. It is renamed because
  // the React hooks lint rule treats any identifier starting with "use" inside a
  // non-component function as a hook call.
  signedIn: async ({ page }, emit) => {
    await signIn(page)
    await emit(page)
  },
})

/**
 * Sign in, then remove anything the test created.
 *
 * Separate from `authedTest` rather than a flag, because cleanup can only run
 * while the session is alive: a test that signs out would otherwise fail its own
 * teardown on a 401. Declaring which tests write keeps that honest instead of
 * guessing from the response code.
 *
 * Teardown lives in the fixture rather than an afterEach hook because Playwright
 * passes only base fixtures to hooks, not the ones a test extends with.
 */
export const writingTest = base.extend<{ signedIn: import('@playwright/test').Page }>({
  signedIn: async ({ page }, emit) => {
    await signIn(page)

    await emit(page)

    // Runs whether the test passed or failed, so a failing test cannot leave
    // rows behind that break the next one.
    await removeMarkedTransactions(page)
  },
})

/**
 * Sign in.
 *
 * Fields are located by `name`, not by label. `PasswordField` carries a reveal
 * toggle whose `aria-label` is "Show password", and Playwright's `getByLabel`
 * matches on a case-insensitive *substring* — so `getByLabel('Password')`
 * resolves to both the input and the button and fails in strict mode. The name
 * attribute is the field's actual contract and does not shift with the label's
 * wording or with an added affordance.
 */
async function signIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login')
  await page.locator('[name="email"]').fill(EMAIL!)
  await page.locator('[name="password"]').fill(PASSWORD!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 20_000 })
}

/** Raw test with the standard `page`, for the one case that must start signed out. */
export const test = base

export { expect, MARKER, removeMarkedTransactions }
