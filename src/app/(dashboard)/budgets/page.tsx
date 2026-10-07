import { BudgetData } from '@/components/budgets/BudgetData'

/**
 * Budgets.
 *
 * This file stays a Server Component and is now almost nothing, which is the
 * point. Before the client-data move it read the profile, resolved the timezone,
 * chose the month, and fetched budgets and categories — so the screen's HTML
 * could not be produced without three round-trips, and nothing about it was
 * prerendered.
 *
 * Now the shell is a `<div>` and the work happens in `BudgetData`, in the
 * browser. Marking the page `'use client'` wholesale would have been the easy
 * version and the worse one: it would put the screen's title behind a bundle
 * download on a metered connection to show one number.
 *
 * **`searchParams` is gone, and that is not a refactor.** This page used to read
 * `?error=` and render it, because `deleteBudgetAction` used to redirect with the
 * failure in the URL. That action now returns `{ error }` and the message
 * renders inside the form that failed (ADR-037). Nothing writes `?error=` any
 * more, so reading it here was code that could only ever be null — and it is the
 * kind that misleads: it looks like the screen handles write failures, which it
 * did not and now genuinely does.
 *
 * Removing it does *not* make this route static. Every authenticated page is
 * `ƒ` because the session is read during rendering, so the win here is dead code
 * rather than prerendering.
 */
export default function BudgetsPage() {
  return (
    <div className="tk-stack">
      <BudgetData />
    </div>
  )
}
