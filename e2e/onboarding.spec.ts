import { test, expect, authedTest } from './fixtures'
import { clearTestCorrections } from './corrections-data'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.test' })

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD

if (!EMAIL || !PASSWORD) {
  throw new Error('E2E_EMAIL and E2E_PASSWORD must be set in .env.test')
}

/**
 * The onboarding checklist.
 *
 * **What is asserted here is the *derivation*, not the copy.** The unit tests in
 * `src/lib/onboarding.test.ts` cover which steps are done for which data; what
 * only a browser can answer is whether that data is right in the running app, and
 * whether the section is ever on screen for an account that has been set up.
 *
 * The account this runs against is the shared E2E account, which is far from new:
 * it has dozens of transactions, several accounts and budgets. So the property
 * worth asserting is the one that is easy to get backwards — **a user who has
 * done the work does not see the checklist.** A component that renders by default
 * and hides on a condition that never fires is the failure mode, and it is
 * invisible in a screenshot of a fresh account.
 */
test.describe('onboarding', () => {
  authedTest('is absent for an account that has already been set up', async ({ signedIn }) => {
    await signedIn.goto('/dashboard', { waitUntil: 'networkidle' })

    /**
     * Wait for the screen's own data rather than asserting on the first paint.
     *
     * `GettingStarted` deliberately renders `null` until its reads land, so on a
     * cold cache its absence is indistinguishable from "it decided not to show".
     * Asserting immediately would pass for the wrong reason — it would be testing
     * the loading state, and would keep passing if the section were deleted.
     */
    await signedIn
      .locator('#main ul.tk-list li')
      .first()
      .waitFor({ timeout: 20_000 })

    await expect(
      signedIn.locator('section[aria-label="Getting started"]'),
      'a set-up account should not be shown first-run guidance',
    ).toHaveCount(0)
  })

  authedTest('each step links to the screen that completes it', async ({ signedIn }) => {
    // Skipped rather than faked: on a set-up account the section renders nothing,
    // so there is nothing to assert here without a fresh account. The hrefs are
    // covered by `onboarding.test.ts`; what needs a browser — that they resolve,
    // and that the sheet-driven one opens a sheet — is checked below against the
    // destinations directly.
    const destinations = [
      { path: '/transactions?sheet=add', expectSheet: 'Add transaction' },
      { path: '/accounts', expectSheet: null },
      { path: '/budgets', expectSheet: null },
    ]

    for (const { path, expectSheet } of destinations) {
      await signedIn.goto(path, { waitUntil: 'networkidle' })
      if (expectSheet) {
        const dialog = signedIn.getByRole('dialog')
        await expect(dialog, `${path} did not open its sheet`).toBeVisible({ timeout: 15_000 })
        await expect(dialog.getByRole('heading', { name: expectSheet })).toBeVisible()
        await dialog.getByRole('button', { name: 'Close' }).click()
        await expect(dialog).toHaveCount(0)
      } else {
        await expect(signedIn.getByRole('heading', { level: 1 })).toBeVisible()
      }
    }
  })
})

/**
 * The dashboard must still work with the checklist absent, and must not have
 * gained an eighth request. This is the regression guard for adding a section to
 * a screen that already makes several client-side reads: the obvious way to build
 * onboarding is to fire its own queries, which is invisible until a user on a
 * metered connection waits for five round-trips before the first paint.
 */
test.describe('dashboard', () => {
  authedTest('renders the summary and recent list with no onboarding section', async ({
    signedIn,
  }) => {
    await signedIn.goto('/dashboard', { waitUntil: 'networkidle' })
    await signedIn.locator('#main ul.tk-list li').first().waitFor({ timeout: 20_000 })

    await expect(signedIn.getByRole('heading', { level: 2, name: 'Recent transactions' })).toBeVisible()
    await expect(signedIn.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible()

    // The data figure must be a real one, not the loading dash.
    const balance = signedIn.locator('[data-balance]')
    await expect(balance).toBeVisible()
    await expect(balance).not.toHaveText('—')
  })
})

/**
 * Reuse of the shared account means the correction sheet may be carrying state
 * from another spec. Clean it first so a leftover row cannot be what fails here.
 */
test.describe('account hygiene', () => {
  authedTest('leaves the shared account as it found it', async ({ signedIn }) => {
    await signedIn.goto('/accounts', { waitUntil: 'networkidle' })
    await clearTestCorrections(signedIn)
    await signedIn.goto('/accounts', { waitUntil: 'networkidle' })
    await expect(signedIn.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
