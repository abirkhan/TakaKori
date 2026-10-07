import { test, authedTest, writingTest, expect, MARKER } from './fixtures'

import type { Locator, Page } from '@playwright/test'

/**
 * The add-transaction sheet.
 *
 * The form is in a modal, so a test has to open it first. It is reached the way
 * a user reaches it — the floating action in the tab bar — rather than by
 * poking at component state, so the test also proves the trigger works.
 *
 * Fields are located by their `name` attribute rather than their label text.
 * The labels wrap their control, so the accessible name also picks up the
 * option and error text sitting inside — `getByLabel('Account', { exact: true })`
 * matches nothing, and the substring form matches both 'Account' and
 * 'To account' once a transfer is selected. The name attribute is the form's
 * actual contract and does not shift with the selected type.
 */
/**
 * Open the add-transaction sheet and return its dialog.
 *
 * Uses the page header's Add action rather than the tab bar's floating button:
 * the floating action is `md:hidden`, and this suite runs at the project's
 * desktop viewport. `e2e/sheets.spec.ts` covers the floating action at phone
 * width, so both triggers are exercised.
 */
async function openAddSheet(page: Page): Promise<Locator> {
  await page.goto('/transactions')
  await page.getByRole('link', { name: 'Add a transaction' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.waitFor({ state: 'visible' })
  return dialog
}

function field(form: Locator, name: string): Locator {
  return form.locator(`[name="${name}"]`)
}

/**
 * Choose a transaction type.
 *
 * The radio inputs are `sr-only` and the visible control is the wrapping
 * `<label>`, which is what a user actually clicks. The input cannot be driven
 * directly: `check()` rejects it as invisible, and `check({ force: true })` is
 * worse than useless — it dispatches a mouse event at the clipped input's
 * coordinates, where nothing is painted, so React never sees the change and the
 * form silently keeps the previous type.
 */
async function chooseType(form: Locator, type: 'income' | 'expense' | 'transfer') {
  await form
    .locator('label')
    .filter({ hasText: new RegExp(`^${type}$`, 'i') })
    .click()
}

/**
 * Choose a filter period.
 *
 * The filter bar renders period presets as a segmented control of `sr-only`
 * radios, for the same reason `chooseType` clicks a label rather than checking
 * the input: `check()` rejects an invisible element and `check({ force: true })`
 * dispatches at coordinates where nothing is painted, so React never sees it.
 */
async function choosePeriod(page: Page, label: string) {
  await page
    .locator('label')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click()
}

/**
 * The filter bar, scoped.
 *
 * `getByLabel('Account')` alone matches both the filter's account select and
 * the add-form's, because both sit on the same page and both wrap their
 * control in a label. The filter card is the one carrying `aria-label="Filters"`.
 */
function filterBar(page: Page): Locator {
  return page.locator('section[aria-label="Filters"]')
}

test('unauthenticated visitors are redirected away from the dashboard', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
})

test('a stale session cookie locks nobody out of the login page', async ({ page }) => {
  // A cookie that no longer corresponds to a usable session must still leave a
  // usable login form. The dangerous case is the two session checks in
  // src/lib/supabase/proxy.ts (local signature) and src/lib/auth.ts (network
  // verified) disagreeing: /login bounces to /dashboard, the page guard fails,
  // and it bounces back in an endless loop with no way to sign in.
  //
  // This covers the half that can be reproduced without a genuinely revoked
  // token: a cookie the auth server will never accept must resolve to the login
  // form rather than to a redirect cycle.
  await page.context().addCookies([
    {
      name: `sb-${projectRef()}-auth-token`,
      value:
        'base64-0.eyJleHBpcmVzX2F0IjoxNzAwMDAwMDAwLCJ1c2VyIjp7ImlkIjoibm90LWEtcmVhbC11c2VyIn19',
      domain: 'localhost',
      path: '/',
    },
  ])

  const response = await page.goto('/login')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

  // And the protected route must settle on /login rather than cycling.
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
})

authedTest('the dashboard renders a balance', async ({ signedIn }) => {
  await signedIn.goto('/dashboard')
  await expect(signedIn.getByRole('heading', { level: 1 })).toBeVisible()
  // Money always renders with the taka sign and exactly two decimals.
  await expect(signedIn.getByText(/৳[\d,]+\.\d{2}/).first()).toBeVisible()
})

writingTest('creating an expense decreases the total balance', async ({ signedIn }) => {
  const before = await readTotalBalance(signedIn)

  const form = await openAddSheet(signedIn)
  await field(form, 'amount').fill('123.45')
  await field(form, 'accountId').selectOption({ label: 'Cash' })
  await field(form, 'categoryId').selectOption({ label: 'Food' })
  await field(form, 'description').fill(`${MARKER} expense`)
  await form.getByRole('button', { name: 'Save transaction' }).click()

  await signedIn.getByText(`${MARKER} expense`).first().waitFor({ timeout: 20_000 })

  const after = await readTotalBalance(signedIn)
  // 123.45 BDT is 12,345 poisha.
  expect(toMinor(after) - toMinor(before)).toBe(-12345)
})

writingTest(
  'a transfer moves money between accounts without changing the total',
  async ({ signedIn }) => {
    // The most important accounting guarantee in this app (ADR-005): moving money
    // between your own accounts is neither income nor expense.
    const totalBefore = await readTotalBalance(signedIn)
    const bankBefore = await readAccountBalance(signedIn, 'Bank')

    const form = await openAddSheet(signedIn)

    await chooseType(form, 'transfer')
    // Selecting transfer must swap the category field for a destination account.
    await expect(field(form, 'counterpartyAccountId')).toBeVisible()
    await expect(field(form, 'categoryId')).toHaveCount(0)

    await field(form, 'accountId').selectOption({ label: 'Cash' })
    await field(form, 'counterpartyAccountId').selectOption({ label: 'Bank' })
    await field(form, 'amount').fill('2500')
    await field(form, 'description').fill(`${MARKER} transfer`)
    await form.getByRole('button', { name: 'Save transaction' }).click()

    await signedIn.getByText(`${MARKER} transfer`).first().waitFor({ timeout: 20_000 })

    const totalAfter = await readTotalBalance(signedIn)
    const bankAfter = await readAccountBalance(signedIn, 'Bank')

    expect(toMinor(totalAfter)).toBe(toMinor(totalBefore))
    expect(toMinor(bankAfter) - toMinor(bankBefore)).toBe(250000)
  },
)

writingTest(
  'an invalid amount is rejected with a readable message, not a crash',
  async ({ signedIn }) => {
    const form = await openAddSheet(signedIn)

    // type=text with an inputMode, so a negative value reaches the server-side
    // validator rather than being blocked by the browser.
    await field(form, 'amount').fill('-50')
    await field(form, 'accountId').selectOption({ label: 'Cash' })
    await field(form, 'categoryId').selectOption({ label: 'Food' })
    await field(form, 'description').fill(`${MARKER} invalid`)
    await form.getByRole('button', { name: 'Save transaction' }).click()

    await expect(form.getByText(/decimal places|valid amount/i)).toBeVisible({ timeout: 15_000 })
    // A rejected submission must not produce a server error page.
    await expect(signedIn).not.toHaveURL(/error/i)
    // And the sheet must still be open, or the user has just lost everything
    // they typed to a validation message they can no longer see.
    await expect(form).toBeVisible()
  },
)

authedTest('the period filter narrows the list via the URL', async ({ signedIn }) => {
  await signedIn.goto('/transactions')
  // The filter writes to ?preset=, which the server resolves in the user's
  // timezone. The client never computes a date boundary.
  const filters = filterBar(signedIn)
  const account = filters.getByLabel('Account')

  await choosePeriod(signedIn, 'This year')
  await signedIn.waitForURL(/preset=year/)

  // Regression guard: the filter bar used to latch into `disabled` after the
  // first change, so a second filter could never be set.
  await expect(account).toBeEnabled()

  await choosePeriod(signedIn, 'This month')
  await signedIn.waitForURL(/preset=month/)
})

authedTest('CSV export returns a downloadable file', async ({ signedIn }) => {
  const response = await signedIn.request.get('/api/export/csv')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-disposition']).toContain('attachment')
  expect(response.headers()['content-type']).toContain('text/csv')

  const body = await response.text()
  expect(body).toContain('Date,Type,Amount')
  // Never silently truncate.
  expect(body.startsWith('# WARNING')).toBe(false)
})

authedTest('reports shows a savings rate', async ({ signedIn }) => {
  await signedIn.goto('/reports?period=month')
  await expect(signedIn.getByRole('heading', { name: 'Reports' })).toBeVisible()
  await expect(signedIn.getByText('Savings rate')).toBeVisible()
})

authedTest('budgets and recurring pages load', async ({ signedIn }) => {
  await signedIn.goto('/budgets')
  await expect(signedIn.getByRole('heading', { level: 1 })).toBeVisible()

  await signedIn.goto('/recurring')
  await expect(signedIn.getByRole('heading', { level: 1 })).toBeVisible()
})

authedTest('signing out returns to the login page', async ({ signedIn }) => {
  await signedIn.goto('/dashboard')
  await signedIn.getByRole('button', { name: 'Sign out' }).click()
  await expect(signedIn).toHaveURL(/\/login/)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read the total balance from the dashboard's balance card.
 *
 * Addressed by `[data-balance]`, not by "the second `<p>` inside a div whose
 * text starts with Total balance". A positional selector couples the test to the
 * card's markup: adding or reordering a line inside it silently starts reading
 * the wrong figure, and the assertion then fails on a number that was never
 * wrong. One attribute means the test breaks only if the value it checks is
 * genuinely gone.
 */
async function readTotalBalance(page: Page): Promise<string> {
  await page.goto('/dashboard')

  /**
   * Wait for a real figure, not the loading placeholder.
   *
   * The dashboard's figures are loaded in the browser now, so the document
   * arrives with an em dash where the balance goes and the number follows a
   * moment later. Reading synchronously returned "—", which `toMinor` parses as
   * zero.
   *
   * That is worse than a failing test. The transfer assertion compares a before
   * and an after, and two zeros are equal — so **that test passed against a
   * dashboard that had rendered nothing at all.** A regression guard that cannot
   * fail is worse than no guard, because it reports a property that was never
   * tested.
   *
   * So the wait is explicit rather than a longer timeout: wait for the element
   * to stop being the placeholder.
   */
  const balance = page.locator('[data-balance]')
  await balance.waitFor({ state: 'visible' })
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-balance]')
      return !!el && el.textContent?.trim() !== '' && el.textContent?.trim() !== '—'
    },
    undefined,
    { timeout: 20_000 },
  )

  return await balance.innerText()
}

/**
 * Read one account's balance from the dashboard's account list.
 *
 * Anchored on the row title rather than on the row's whole text, and read from
 * the trailing slot rather than from the last `span` — the same coupling problem
 * as `readTotalBalance`, in the row that a `<span>` reordering would break.
 */
async function readAccountBalance(page: Page, name: string): Promise<string> {
  await page.goto('/dashboard')
  const row = page.locator('li').filter({
    has: page.locator(`[data-row-title="${name}"]`),
  })
  return await row.locator('[data-row-trailing]').innerText()
}

/** The Supabase project ref, which is the middle of the session cookie name. */
function projectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const ref = url?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
  if (!ref) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set; is .env.test present?')
  return ref
}

/**
 * Parse a rendered figure such as "৳2,26,050.25" or "−৳1,234.56" into minor
 * units (poisha).
 *
 * Written independently of src/lib/money.ts so the test checks the rendered
 * string rather than trusting the code that produced it — which is the whole
 * point of parsing it again here.
 *
 * The digits are split and recombined as strings rather than multiplied by 100
 * as a float. `1234.56 * 100` is `123455.9999999999` in IEEE 754, so a naive
 * parse made `expect(diff).toBe(-12345)` fail on a correct figure whenever the
 * balance happened to carry a third fractional digit. It passed for months only
 * because the seeded balances' errors happened to cancel.
 */
function toMinor(formatted: string): number {
  const cleaned = formatted.replace(/[^\d.-]/g, '').trim()
  const negative = cleaned.startsWith('-')
  const [whole = '0', fraction = ''] = cleaned.replace('-', '').split('.')
  const poisha = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2) || '0')
  return negative ? -poisha : poisha
}
