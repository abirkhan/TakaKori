'use client'

import {
  getAccountBalances,
  getProfile,
  listBudgetsWithProgress,
  listTransactions,
} from '@/lib/queries/client'
import { useQuery } from '@/lib/client/useQuery'
import { keys } from '@/lib/client/invalidations'
import { todayIn } from '@/lib/dates'
import {
  onboardingSteps,
  shouldShowOnboarding,
  type OnboardingFacts,
} from '@/lib/onboarding'
import { RowLink } from '@/components/ui/Row'

/**
 * First-run guidance on the dashboard.
 *
 * **Three reads, and two of them the dashboard was already making.** `keys.balances()`
 * is the same key `AccountsList` uses, so it is one cache entry served to both
 * rather than two requests. Only the transaction probe is new.
 *
 * **Lives on the dashboard, above the summary.** An empty dashboard with a figure
 * of `—` in three places is the state this replaces, and a checklist below the
 * fold is a checklist nobody scrolls to.
 *
 * **Not `fixed`, not a sheet.** It pushes the page down. Everything else in this
 * shell competes for the edges of the screen already — see ADR-031 — and the one
 * thing this needs more of is *vertical* room on a phone.
 */
export function GettingStarted() {
  const profile = useQuery(keys.profile(), () => getProfile())
  const balances = useQuery(keys.balances(), () => getAccountBalances())

  /**
   * Budgets need today's date in the user's timezone (ADR-006), so this read is
   * keyed on the range like every other one that resolves a month — and like every
   * other one it waits for the profile rather than guessing a zone.
   */
  const timezone = profile.data?.timezone ?? null
  const budgets = useQuery(
    timezone ? keys.budgets('onboarding') : null,
    () => listBudgetsWithProgress(todayIn(timezone!)),
  )

  /**
   * **Lifetime, and deliberately not a month total.**
   *
   * `workspace_totals.net_balance` is 0 when there are no transactions *and* also 0
   * when income and expense cancel exactly, so a balance cannot answer "have you
   * ever recorded anything" — and an account whose only transaction was in January
   * has still been used.
   *
   * `limit: 1` is the cheapest honest source: the presence of a row is the answer,
   * and the payload is one transaction. Keyed distinctly from the dashboard's own
   * `recent:6` read rather than shared with it, because the two answer different
   * questions and conflating them would make the checklist depend on a screen that
   * might not be mounted.
   */
  const anyTransaction = useQuery(keys.transactions('onboarding:any'), () =>
    listTransactions({ limit: 1 }),
  )

  /**
   * `null` until the reads land, which means "show nothing yet".
   *
   * **A checklist must never flash before its data arrives.** Rendering against
   * null would show three undone steps for a user with 400 transactions on every
   * cold start, then snap them to ticked a moment later — a flicker that reads as a
   * bug and, worse, briefly tells a returning user they have done nothing. Waiting
   * costs one frame of nothing; the alternative is a lie.
   */
  const facts: OnboardingFacts | null =
    balances.data !== null && budgets.data !== null && anyTransaction.data !== null
      ? {
          // `balances` is every account including archived ones, which is what we
          // want: an archived second account is still a second account.
          accounts: balances.data.length,
          hasBudgets: budgets.data.length > 0,
          hasTransactions: anyTransaction.data.length > 0,
        }
      : null

  // Loading is a render of nothing rather than a skeleton: the section below the
  // summary is already there, and a placeholder box that resolves into content
  // pushes the page down under the user's thumb.
  if (!facts) return null
  if (!shouldShowOnboarding(facts)) return null

  const steps = onboardingSteps(facts)
  const done = steps.filter((s) => s.done).length

  return (
    <section aria-label="Getting started" className="tk-card">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="tk-section">Get started</h2>
        <span className="tk-caption" data-onboarding-progress>
          {done} of {steps.length}
        </span>
      </div>

      {/**
       * A list, not a set of `EmptyState`s. `RowLink` gives every line a 60px
       * target and one shared left edge, which is what ADR-029 asks of a list — and
       * it means each step is a real navigation rather than a paragraph with an
       * action hidden at the end of it.
       */}
      <ul className="mt-3 flex flex-col gap-1">
        {steps.map((step) => (
          <li key={step.id}>
            <RowLink
              href={step.href}
              title={step.title}
              subtitle={step.detail}
              linkLabel={step.title}
              /**
               * **The tick is the state, not a word beside it.**
               *
               * A `Done` badge measured 66px and cost the title column 80px — from
               * 180px to 100px — which truncated "Add an account" to "Add an acco…".
               * So the check is carried by the icon tile's tint plus a tick glyph,
               * which is 18px of an already-present element rather than a new
               * column.
               *
               * Colour is still not the only channel: the tick is a *shape* that
               * means done, beside a step whose wording is an instruction rather
               * than a status. That is the rule in the design system — "colour is
               * never the only channel" is satisfied by shape, not only by a word.
               */
              icon={step.done ? 'check' : step.icon}
              tone={step.done ? 'brand' : 'sky'}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
