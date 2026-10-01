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

  const marked = page.locator('tr').filter({ hasText: MARKER })

  // Bounded so a delete that silently fails fails the test rather than hanging.
  for (let guard = 0; guard < 25; guard++) {
    const remaining = await marked.count()
    if (remaining === 0) return

    await marked.first().getByRole('button', { name: 'Delete' }).click()
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

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL!)
  await page.getByLabel('Password').fill(PASSWORD!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 20_000 })
}

/** Raw test with the standard `page`, for the one case that must start signed out. */
export const test = base

export { expect, MARKER, removeMarkedTransactions }
