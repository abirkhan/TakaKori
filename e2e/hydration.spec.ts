import { test as base, expect } from '@playwright/test'
import { authedTest } from './fixtures'

/**
 * Hydration.
 *
 * React error #418 — "the server rendered HTML didn't match the client" — was
 * reproduced on every authed screen for some time without a cause, and two plausible
 * hypotheses (a stale service-worker document, and `useQuery` reading a warmed cache
 * during hydration) had already been eliminated.
 *
 * The cause was `Modal`. It returned `null` on the server, where there is no
 * `document`, but rendered a portal on the client **whether or not it was open**. The
 * app bar's "More" dialog is mounted closed on every authed screen, so every load put a
 * `<dialog>` in the client's tree that had no counterpart in the server's, and React
 * gave up on hydrating the whole tree.
 *
 * **Why nothing caught it.** Every existing sheet test asserts that a closed sheet is
 * not *painted*, and `dialog:not([open])` is `display: none` — so the element was
 * correctly invisible while still being present in the DOM. A visual assertion cannot
 * see a hidden node. It took a console assertion to catch it, so that is what this is.
 *
 * The test fails on the error text rather than on any rendered state, because a
 * hydration mismatch is by definition recovered from: React re-renders the tree on the
 * client and the page ends up correct. Nothing about the result looks wrong.
 */
base.describe('hydration', () => {
  base.use({ viewport: { width: 390, height: 844 } })

  /**
   * @param path  a screen to load signed in
   * @param wait  how long to watch. The mismatch is reported during hydration, but the
   *   error arrives asynchronously and can land after `load`.
   */
  async function hydrationErrors(
    page: import('@playwright/test').Page,
    visit: (p: import('@playwright/test').Page) => Promise<void>,
  ) {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await visit(page)
    await page.waitForTimeout(3000)
    return errors.filter((e) => /hydrat|did not match|server rendered/i.test(e))
  }

  authedTest('an authed screen hydrates without a mismatch', async ({ signedIn }) => {
    const errors = await hydrationErrors(signedIn, async (p) => { await p.goto('/accounts') })
    expect(errors, `hydration reported:\n${errors.join('\n')}`).toEqual([])
  })

  authedTest('the app bar hydrates without a mismatch', async ({ signedIn }) => {
    // The header's "More" dialog is the specific node that caused it, and it is on
    // every authed screen. Named separately so a regression says *which* one.
    const errors = await hydrationErrors(signedIn, async (p) => { await p.goto('/dashboard') })
    expect(errors, `hydration reported:\n${errors.join('\n')}`).toEqual([])
  })

  authedTest('opening and closing a sheet hydrates cleanly', async ({ signedIn }) => {
    const errors = await hydrationErrors(signedIn, async (p) => {
      await p.goto('/transactions')
      await p.locator('nav[aria-label="Primary"]').getByRole('link', { name: 'Add a transaction' }).click()
      await expect(p.getByRole('dialog')).toBeVisible()
      await p.keyboard.press('Escape')
      await expect(p.getByRole('dialog')).toBeHidden()
    })
    expect(errors, `hydration reported:\n${errors.join('\n')}`).toEqual([])
  })
})