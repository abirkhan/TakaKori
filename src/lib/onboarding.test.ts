import { describe, expect, it } from 'vitest'
import {
  onboardingSteps,
  shouldShowOnboarding,
  SEEDED_ACCOUNTS,
  type OnboardingFacts,
} from './onboarding'

/**
 * The checklist's whole correctness claim is that it is derived from data rather
 * than stored, so these tests are mostly about which *data* counts. Each case is a
 * way the derivation could be wrong and leave a user staring at an empty screen
 * believing there is nothing to do.
 */

function facts(over: Partial<OnboardingFacts> = {}): OnboardingFacts {
  return {
    hasTransactions: false,
    accounts: SEEDED_ACCOUNTS,
    hasBudgets: false,
    ...over,
  }
}

describe('onboardingSteps', () => {
  it('records first, adds an account second, sets a budget third', () => {
    // The order is the argument, not a preference: an app with no transactions has
    // nothing to show on any other screen, so the other steps are wasted until the
    // first one is done.
    expect(onboardingSteps(facts()).map((s) => s.id)).toEqual(['record', 'account', 'budget'])
  })

  it('every step goes somewhere, because a step with no href is a dead end', () => {
    for (const step of onboardingSteps(facts())) {
      expect(step.href, `${step.id} has no href`).toBeTruthy()
    }
  })

  /**
   * The copy has to fit.
   *
   * `RowContents` truncates both lines, and at 320px — the narrowest phone the
   * layout suite measures — the text column is 110px. Every draft of these strings
   * was correct and unreadable: "Record your first expense" cut to "Record your
   * first e…", and a truncated instruction loses the action, which is the part
   * that matters.
   *
   * **This cannot measure pixels**, so it asserts the budget the copy has to fit
   * in. 110px of `.tk-body` (15px, 500 weight) holds roughly 17 characters; the
   * longest title here is "Add an account" at 15. The constant is what would need
   * revisiting if the type scale or the row's padding changed, and it is written
   * down here rather than left as a screenshot someone remembered.
   */
  it('keeps every title and detail inside the 320px text column', () => {
    for (const step of onboardingSteps(facts())) {
      expect(step.title.length, `"${step.title}" is too long for 320px`).toBeLessThanOrEqual(17)
      expect(step.detail.length, `"${step.detail}" is too long for 320px`).toBeLessThanOrEqual(22)
    }
  })

  it('marks only the steps whose data is present as done', () => {
    const steps = onboardingSteps(facts({ hasTransactions: true, hasBudgets: true }))
    expect(steps.map((s) => s.done)).toEqual([true, false, true])
  })

  /**
   * The second account is the one that can be got wrong in two directions.
   *
   * Counting "more than zero" would show the step as done on a brand-new account,
   * because signup seeds one — so a first-time user would never be told that
   * transfers need a second account. Counting "more than two" would never let it
   * be completed by the user who does the obvious thing.
   */
  it('treats the seeded account as not-yet-set-up', () => {
    expect(onboardingSteps(facts({ accounts: 1 }))[1].done).toBe(false)
    expect(onboardingSteps(facts({ accounts: 2 }))[1].done).toBe(true)
  })

  it('counts transactions in any period, not the current month', () => {
    // A user who recorded something in January and opens the app in March has
    // recorded something. The caller passes a count, and this test documents that
    // the count it must pass is lifetime — an empty current month is not a reason
    // to tell someone they have never used the app.
    expect(onboardingSteps(facts({ hasTransactions: true }))[0].done).toBe(true)
  })

  /**
   * A completed step still needs a different icon.
   *
   * The component swaps the tile glyph for a tick when a step is done. `GettingStarted`
   * is the only consumer of `icon`, so a change here is invisible to the unit tests
   * — but it is what carries the "colour is never the only channel" rule for this
   * component, and the badge that used to carry it instead cost the title column
   * 80px and truncated every line.
   */
  it('gives each step its own icon, so none is a duplicate of another', () => {
    const icons = onboardingSteps(facts()).map((s) => s.icon)
    expect(new Set(icons).size).toBe(icons.length)
  })

  it('keeps finished steps in place so the list shortens rather than reshuffles', () => {
    const all = onboardingSteps(facts())
    const partly = onboardingSteps(facts({ hasTransactions: true }))
    // Same three entries, so a row does not move under a thumb mid-tap.
    expect(partly).toHaveLength(all.length)
    expect(partly.map((s) => s.id)).toEqual(all.map((s) => s.id))
  })
})

describe('shouldShowOnboarding', () => {
  it('shows on a brand-new account, which is the dead end it replaces', () => {
    expect(shouldShowOnboarding(facts())).toBe(true)
  })

  it('hides once every step is done', () => {
    expect(shouldShowOnboarding(facts({ hasTransactions: true, accounts: 2, hasBudgets: true }))).toBe(
      false,
    )
  })

  /**
   * The regression this module exists to prevent.
   *
   * A stored "onboarding seen" flag is set once and never re-read, so a user who
   * deletes their only transaction is left with an empty dashboard and no
   * guidance — the precise failure the checklist was added to fix. Deriving the
   * decision from the data makes that state unreachable.
   */
  it('comes back if the data that satisfied it is deleted', () => {
    const used = facts({ hasTransactions: true, accounts: 2, hasBudgets: true })
    expect(shouldShowOnboarding(used)).toBe(false)

    // Every transaction deleted. Nothing "un-sees" a flag, but the facts changed.
    const emptied = { ...used, hasTransactions: false }
    expect(shouldShowOnboarding(emptied)).toBe(true)
    expect(onboardingSteps(emptied)[0].done).toBe(false)
  })

  it('stays hidden while only the optional-looking steps are done', () => {
    // The reverse case: one incomplete step is enough, and the checklist does not
    // quietly disappear because the user did most of it.
    expect(shouldShowOnboarding(facts({ hasTransactions: true, hasBudgets: true }))).toBe(true)
    expect(shouldShowOnboarding(facts({ hasTransactions: true, accounts: 2 }))).toBe(true)
  })
})
