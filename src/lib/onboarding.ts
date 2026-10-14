/**
 * First-run guidance.
 *
 * **Derived from what the ledger actually contains, not from a "has seen
 * onboarding" flag.** Three reasons, and the flag loses all three:
 *
 * 1. **A flag is a lie waiting to happen.** `onboarding_seen = true` and zero
 *    transactions means the checklist is hidden behind a screen that shows
 *    nothing — which is the exact dead end it exists to fix. Deleting every
 *    transaction (a real action, one tap per row) re-creates that state, and only
 *    a derived check notices.
 * 2. **A flag needs a migration, and a migration needs `supabase login`.** That
 *    is the one open item in Phase 0, blocked on an interactive credential. A
 *    feature that cannot ship because of a CLI login is a feature that will not
 *    ship.
 * 3. **It cannot disagree with the screen.** The dashboard and the checklist read
 *    the same cached reads, so there is no state in which one says "you have
 *    recorded something" and the other says otherwise.
 *
 * **Every step's done-ness is a fact the app already stores.** Transactions,
 * accounts and budgets are all rows; asking whether any exist is a count, not a
 * judgement. Nothing here infers intent from behaviour.
 */

/** What the checklist needs to know, all of it counts. */
export interface OnboardingFacts {
  /** Any transaction at all, in any period. */
  hasTransactions: boolean
  /**
   * Whether the user has more than the account provisioning seeded.
   *
   * Signup creates exactly one — "Cash" — so a count above one is a real signal
   * that they have set up a second account rather than an artefact of the app
   * being empty. Counting against 1 rather than 0 is what makes this step
   * meaningful on day one.
   */
  accounts: number
  hasBudgets: boolean
}

/** One line of the checklist. */
export interface OnboardingStep {
  id: string
  title: string
  /** What this step is *for*, in one clause. Not a restatement of the title. */
  detail: string
  /** Where the step happens. Every step must go somewhere. */
  href: string
  icon: 'receipt' | 'bank' | 'target'
  done: boolean
}

/** One account is created at signup. See `OnboardingFacts.seededAccounts`. */
export const SEEDED_ACCOUNTS = 1

/**
 * The steps, in the order a first-time user needs them.
 *
 * **Order is the argument.** Record something first: an app with no transactions
 * has nothing to show on any other screen, so every other step is wasted until
 * this one is done. Then a second account, because a single "Cash" account cannot
 * express a transfer — the feature the app exists to get right (ADR-005). Then a
 * budget, which is only meaningful once there is spend to compare against.
 *
 * Done steps are kept rather than filtered out, so the checklist shortens as it
 * completes instead of the remaining items jumping up the screen. A progress
 * indicator that reshuffles is harder to read than one that ticks.
 */
export function onboardingSteps(facts: OnboardingFacts): OnboardingStep[] {
  const accountsDone = facts.accounts > SEEDED_ACCOUNTS

  /**
   * Every title and detail is sized to survive **320px**, the narrowest phone
   * still in use and the width `layout.spec.ts` measures.
   *
   * **Measured, not estimated, and twice.** The first draft ran to "Record your
   * first expense" and "Lunch, a bKash recharge, a bus fare — anything real." Both
   * were correct and both were unreadable: `RowContents` truncates, and at 320px
   * the text column is 110px, so every line cut to "Record your first e…". The
   * rows below it on the same screen — "Budgets", "Recurring" — do not truncate,
   * because their titles are short. Matching that is the standard.
   *
   * A truncated instruction is worse than a plain one: the words that vanish are
   * usually the action. So these are short enough to be complete rather than long
   * enough to be helpful, and the length that was cut carries no information —
   * "a bank account or wallet" and "a bank or wallet" say the same thing.
   */
  return [
    {
      id: 'record',
      // "Add one" rather than "Add a transaction", and "Lunch, a fare, a recharge."
      // rather than anything longer: at 320px the text column is 110px, and these
      // were the last two lines still cutting. The header above says what this is,
      // and the three examples are interchangeable with each other, so nothing is
      // lost by having only one.
      title: 'Add one',
      detail: 'Lunch, a fare.',
      href: '/transactions?sheet=add',
      icon: 'receipt',
      done: facts.hasTransactions,
    },
    {
      id: 'account',
      title: 'Add an account',
      detail: 'A bank or a wallet.',
      href: '/accounts',
      icon: 'bank',
      done: accountsDone,
    },
    {
      id: 'budget',
      title: 'Set a budget',
      detail: 'See your pace.',
      href: '/budgets',
      icon: 'target',
      done: facts.hasBudgets,
    },
  ]
}

/**
 * Whether the checklist should render at all.
 *
 * **Gone once every step is done, and not dismissible while any remain.** The
 * alternative — a close button that hides it for the session — was rejected
 * because it reintroduces the exact failure this replaces: a user who dismisses
 * an empty dashboard has an empty dashboard, and nothing ever tells them again.
 * There is a permanent route to all three steps underneath, so the checklist is
 * never the only way in; it just stops being noise.
 */
export function shouldShowOnboarding(facts: OnboardingFacts): boolean {
  return onboardingSteps(facts).some((step) => !step.done)
}
