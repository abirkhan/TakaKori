import { test, authedTest, writingTest, expect, MARKER } from './fixtures'

import type { Locator, Page } from '@playwright/test'

/**
 * The add-transaction form.
 *
 * Fields are located by their `name` attribute rather than their label text.
 * The labels wrap their control, so the accessible name also picks up the
 * option and error text sitting inside — `getByLabel('Account', { exact: true })`
 * matches nothing, and the substring form matches both 'Account' and
 * 'To account' once a transfer is selected. The name attribute is the form's
 * actual contract and does not shift with the selected type.
 */
function addForm(page: Page): Locator {
  return page.locator('form').filter({ hasText: 'Add transaction' }).first()
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

test('unauthenticated visitors are redirected away from the dashboard', async ({ page }) => {
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

  await signedIn.goto('/transactions')
  const form = addForm(signedIn)
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

    await signedIn.goto('/transactions')
    const form = addForm(signedIn)

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
    await signedIn.goto('/transactions')
    const form = addForm(signedIn)

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
  },
)

authedTest('the period filter narrows the list via the URL', async ({ signedIn }) => {
  await signedIn.goto('/transactions')
  // The filter writes to ?preset=, which the server resolves in the user's
  // timezone. The client never computes a date boundary.
  const period = signedIn.getByLabel('Period')

  await period.selectOption('year')
  await signedIn.waitForURL(/preset=year/)

  // Regression guard: the filter bar used to latch into `disabled` after the
  // first change, so a second filter could never be set.
  await expect(period).toBeEnabled()

  await period.selectOption('month')
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

async function readTotalBalance(page: Page): Promise<string> {
  await page.goto('/dashboard')
  const card = page
    .locator('div')
    .filter({ hasText: /^Total balance/ })
    .first()
  return await card.locator('p').nth(1).innerText()
}

async function readAccountBalance(page: Page, name: string): Promise<string> {
  await page.goto('/dashboard')
  const row = page.locator('li').filter({ hasText: name }).first()
  return await row.locator('span').last().innerText()
}

/**
 * Parse a rendered figure such as "৳2,26,050.25" or "−৳1,234.56" into minor
 * units (poisha). Written independently of src/lib/money.ts so the test checks
 * the rendered string rather than trusting the code that produced it.
 */
function toMinor(formatted: string): number {
  const cleaned = formatted.replace(/[^\d.-]/g, '')
  const negative = cleaned.trim().startsWith('-')
  const minor = Math.abs(Number(cleaned || '0')) * 100 // BDT has 2 decimal places
  return negative ? -minor : minor
}
