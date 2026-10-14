import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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

/**
 * The error boundaries.
 *
 * **Asserted by crashing a real route, not by inspecting the DOM for a component
 * that exists.** A boundary file that is present but wired to the wrong segment
 * looks identical to a working one in review and in a file listing; the only way
 * to know an error is caught is to throw one and see what renders.
 *
 * Each case below writes a temporary `throw` into a route, loads it, asserts on
 * what the user sees, and puts the file back. That is unusual for this suite, and
 * the reason is specific: there is no other way to reach the failure path, and a
 * boundary that has never caught anything is a boundary nobody knows works.
 *
 * `restore()` runs in a `finally`, so a failed assertion still puts the source back
 * — otherwise the next test in the file would run against a crashed route and
 * report a failure that has nothing to do with it.
 */
const BOUNDARY_PROBE = "throw new Error('e2e error boundary probe')"

/**
 * The boundary's alert region, scoped past the dev overlay.
 *
 * **Next's development overlay also carries `role="alert"`**, and the suite runs
 * against `npm run dev`, so an unscoped `[role="alert"]` matches two elements and
 * fails in strict mode. Scoping to `main` finds the app's own boundary and ignores
 * the overlay — which is also the more honest assertion, since `global-error`
 * renders its own `<body>` and so cannot be reached this way.
 */
function appAlert(page: import('@playwright/test').Page) {
  return page.locator('main [role="alert"]').first()
}

/** Rewrite a route file to throw on render, and return a function that undoes it. */
async function crashRoute(
  routeFile: string,
  functionName: string,
): Promise<() => Promise<void>> {
  const path = join(process.cwd(), routeFile)
  const original = await readFile(path, 'utf8')

  // Anchored on the export, so the insertion cannot land inside a comment or a
  // different function with a similar name.
  const pattern = new RegExp(`(export default function ${functionName}\\([^)]*\\)\\s*\\{)`)
  if (!pattern.test(original)) {
    throw new Error(`Could not find ${functionName} in ${routeFile}; the probe needs updating`)
  }
  await writeFile(path, original.replace(pattern, `$1\n  ${BOUNDARY_PROBE}\n`), 'utf8')

  return async () => {
    await writeFile(path, original, 'utf8')
  }
}

test.describe('error boundaries', () => {
  /**
   * The one that matters: a crash inside the authenticated shell.
   *
   * **Asserting that the shell survives is the load-bearing part.** The app bar,
   * the tab bar and sign-out all live in `layout.tsx`, and an `error.tsx` placed at
   * the root instead of the segment would replace all of them — leaving a user on
   * a crashed screen with no way to navigate anywhere and no way to sign out.
   */
  authedTest('a crash on the dashboard keeps the shell and offers a way out', async ({ signedIn }) => {
    const restore = await crashRoute('src/app/(dashboard)/dashboard/page.tsx', 'DashboardPage')
    try {
      await signedIn.goto('/dashboard', { waitUntil: 'domcontentloaded' })

      const alert = appAlert(signedIn)
      await expect(alert).toBeVisible({ timeout: 20_000 })

      // The retry, and the way out. Both, because retry can fail again.
      await expect(signedIn.getByRole('button', { name: 'Try again' })).toBeVisible()
      await expect(signedIn.getByRole('link', { name: 'Go to the dashboard' })).toBeVisible()

      // The shell survived. Asserted on the *app bar*, which renders at every
      // width — the bottom tab bar is `md:hidden` and this project runs Desktop
      // Chrome, so asserting it visible would be asserting a responsive rule.
      // Both navs are asserted as attached, which is the part that matters: a
      // boundary at the root would unmount them along with everything else.
      await expect(signedIn.getByRole('button', { name: 'Sign out' })).toBeVisible()
      await expect(signedIn.locator('header a[aria-label="TakaKori home"]')).toBeVisible()
      await expect(signedIn.locator('nav[aria-label="Primary"]')).toBeAttached()
      await expect(signedIn.locator('nav[aria-label="Sections"]')).toBeAttached()

      // No exclamation mark and no "something went wrong" — the design system's
      // voice rules, which nobody reviews on a screen that only appears on failure.
      await expect(alert).not.toContainText('!')
      await expect(alert).not.toContainText(/something went wrong/i)
    } finally {
      await restore()
    }
  })

  /**
   * The auth boundary, and the specific thing it gets wrong by default.
   *
   * A shared component's obvious default for "a second way out" is the dashboard.
   * On a crashed sign-in page that link redirects straight back to `/login` by
   * `requireUser()` — a loop, on the one screen where being stuck is most likely.
   * Asserting the href is what stops the default coming back.
   */
  test('a crash on sign-in does not offer a link that leads back to sign-in', async ({ page }) => {
    const restore = await crashRoute('src/app/(auth)/login/page.tsx', 'LoginPage')
    try {
      await page.goto('/login', { waitUntil: 'domcontentloaded' })

      const alert = appAlert(page)
      await expect(alert).toBeVisible({ timeout: 20_000 })

      // No tab bar: every tab is a link into (dashboard), which would bounce a
      // signed-out user straight back here.
      await expect(page.locator('nav[aria-label="Primary"]')).toHaveCount(0)

      const wayOut = alert.getByRole('link')
      await expect(wayOut).toHaveAttribute('href', '/login')
    } finally {
      await restore()
    }
  })

  /**
   * `global-error.tsx` is the only boundary that has to render without the app.
   *
   * **It cannot use `ErrorScreen`, because the root layout is what loads
   * `globals.css`** — and this file replaces the root layout. So the assertion is
   * that it is *styled* rather than merely present: a global-error that rendered
   * with no CSS would look like the failure it is meant to replace.
   *
   * A Server Component error, so it is the path that carries a digest — which is
   * the only thing that makes a report actionable, and the reason this is worth
   * checking rather than assuming.
   */
  test('a crash in the root layout renders a styled page of its own', async ({ page }) => {
    const restore = await crashRoute('src/app/layout.tsx', 'RootLayout')
    try {
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

      /**
       * Scoped to the body rather than `main`: `global-error` replaces the root
       * layout and renders its own `<html>` and `<body>`, so there is no `main`
       * element to find here. `.card` is that file's own class, so this still
       * proves the global boundary rendered rather than some other fallback.
       */
      const alert = page.locator('body [role="alert"]').first()
      await expect(alert).toBeVisible({ timeout: 20_000 })

      // Styled without the app's stylesheet: a background that is not the browser
      // default white, and a title that is not the default serif.
      const painted = await page.evaluate(() => {
        const body = getComputedStyle(document.body)
        const heading = document.querySelector('h1')
        return {
          background: body.backgroundColor,
          fontFamily: body.fontFamily,
          headingWeight: heading ? getComputedStyle(heading).fontWeight : null,
        }
      })
      expect(painted.background, 'the global boundary rendered unstyled').not.toBe('rgb(255, 255, 255)')
      expect(painted.headingWeight).toBe('600')

      // A server error carries a digest, and it is the only thing that can match
      // this failure to a server log line.
      await expect(alert).toContainText(/Reference code: \d+/)
    } finally {
      await restore()
    }
  })
})
