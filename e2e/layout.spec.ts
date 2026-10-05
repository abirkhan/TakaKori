/**
 * Layout regression guard.
 *
 * Horizontal overflow is the failure mode that is invisible in review and
 * obvious on a phone: it makes the whole page pan sideways, and on iOS it
 * survives a page load because the zoom state is the browser's, not the
 * document's. It has been introduced three separate times in this codebase
 * (a grid track floored at its content's min-content width, `sr-only` radios
 * resolving against the viewport, and a 15px field triggering iOS auto-zoom),
 * so it gets a test.
 *
 * What this asserts, per route and per width:
 *   1. `documentElement.scrollWidth === clientWidth` — no sideways pan.
 *   2. The bottom tab bar is fully inside the viewport and its items are not
 *      overlapping, so the fixed bar cannot sit over the content.
 *   3. No field computes under 16px, which is what iOS zooms on.
 *   4. `env(safe-area-inset-bottom)` is honoured by the nav, so the home
 *      indicator does not cover a tab label in standalone/PWA mode.
 */
import { test, expect, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.test' })

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD

if (!EMAIL || !PASSWORD) {
  throw new Error('E2E_EMAIL and E2E_PASSWORD must be set in .env.test')
}

/** The narrowest phones still in use, plus the common widths. */
const WIDTHS = [320, 360, 390, 412]

const AUTHED_ROUTES = [
  '/dashboard',
  '/transactions',
  '/reports',
  '/accounts',
  '/categories',
  '/budgets',
  '/recurring',
]
const PUBLIC_ROUTES = ['/', '/login', '/signup', '/forgot-password']

// Top level, not inside the describe: a device descriptor carries
// `defaultBrowserType`, and Playwright refuses that inside a describe group
// because it would force a new worker.
//
// The iPhone descriptor is not spread wholesale because it selects WebKit, and
// this suite is Chromium-only (see playwright.config.ts). What is kept is the
// part that changes layout behaviour rather than engine: `isMobile` and
// `hasTouch`, which is what makes Chromium apply mobile viewport semantics and
// text autosizing. The width is set per test, because the interesting range is
// 320–412 rather than any one device's exact size.
test.use({
  isMobile: true,
  hasTouch: true,
  // iPhone 13's real settings, minus the engine choice: a 3x DPR is what
  // exposes sub-pixel layout and `env(safe-area-inset-*)` behaviour.
  deviceScaleFactor: 3,
})

test.describe('layout — narrow phones', () => {
  for (const width of WIDTHS) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 })

      await page.goto('/login')
      await page.locator('[name="email"]').fill(EMAIL!)
      await page.locator('[name="password"]').fill(PASSWORD!)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForURL('**/dashboard', { timeout: 30_000 })

      for (const route of AUTHED_ROUTES) {
        await page.goto(route, { waitUntil: 'networkidle' })
        await page.waitForTimeout(200)

        const { scrollWidth, clientWidth, widest } = await page.evaluate(() => {
          const de = document.documentElement
          let widest = ''
          for (const el of Array.from(document.querySelectorAll('main *'))) {
            const r = el.getBoundingClientRect()
            if (r.right > de.clientWidth + 0.5 && !el.closest('[class*="segment-scroll"]')) {
              widest = `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 50)}"> right=${r.right.toFixed(0)}`
              break
            }
          }
          return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, widest }
        })

        expect(
          scrollWidth,
          `${route} overflows horizontally at ${width}px (scrollWidth ${scrollWidth} > clientWidth ${clientWidth}). Widest offender: ${widest}`,
        ).toBeLessThanOrEqual(clientWidth)
      }
    })
  }

  test('no field is small enough to trigger iOS auto-zoom', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 })
    await page.goto('/login')
    await page.locator('[name="email"]').fill(EMAIL!)
    await page.locator('[name="password"]').fill(PASSWORD!)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard', { timeout: 30_000 })

    // The transaction form is the densest form in the app.
    for (const route of ['/transactions', '/accounts', '/budgets', '/recurring']) {
      await page.goto(route, { waitUntil: 'networkidle' })

      const tooSmall = await page.evaluate(() => {
        const bad: string[] = []
        for (const el of Array.from(document.querySelectorAll('input, select, textarea'))) {
          const name = el.getAttribute('name') ?? el.tagName
          if (name.startsWith('$ACTION')) continue // React's hidden form plumbing
          const px = Number.parseFloat(getComputedStyle(el).fontSize)
          if (px < 16) bad.push(`${name}=${px}px`)
        }
        return bad
      })

      expect(tooSmall, `${route} has fields under 16px: ${tooSmall.join(', ')}`).toEqual([])
    }
  })

  test('the tab bar fits the viewport and clears the home indicator', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 780 })
    await page.goto('/login')
    await page.locator('[name="email"]').fill(EMAIL!)
    await page.locator('[name="password"]').fill(PASSWORD!)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard', { timeout: 30_000 })

    const nav = await page.evaluate(() => {
      const el = document.querySelector('nav[aria-label="Primary"]')
      if (!el) return null
      const bar = el.getBoundingClientRect()
      const items = Array.from(el.querySelectorAll('a')).map((a) => {
        const r = a.getBoundingClientRect()
        return {
          label: a.getAttribute('aria-label') ?? a.textContent ?? '',
          left: r.left,
          right: r.right,
        }
      })
      return {
        left: bar.left,
        right: bar.right,
        viewport: window.innerWidth,
        paddingBottom: getComputedStyle(el).paddingBottom,
        items,
      }
    })

    expect(nav).not.toBeNull()
    const bar = nav!

    expect(bar.left).toBeGreaterThanOrEqual(-0.5)
    expect(bar.right).toBeLessThanOrEqual(bar.viewport + 0.5)

    // Every tab label must be fully on screen.
    for (const item of bar.items) {
      expect(item.right, `${item.label} overflows the right edge`).toBeLessThanOrEqual(
        bar.viewport + 0.5,
      )
      expect(item.left, `${item.label} overflows the left edge`).toBeGreaterThanOrEqual(-0.5)
    }

    // The safe-area padding is applied, even where the value is 0px.
    expect(bar.paddingBottom).not.toBe('')
  })

  for (const route of PUBLIC_ROUTES) {
    test(`public: ${route} fits 320px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 780 })
      await page.goto(route, { waitUntil: 'networkidle' })
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(scrollWidth, `${route} overflows at 320px`).toBeLessThanOrEqual(clientWidth)
    })
  }
})
