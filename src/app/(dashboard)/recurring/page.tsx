import { RecurringData } from '@/components/recurring/RecurringData'

/**
 * Recurring.
 *
 * Was the widest of the three small screens: it read the profile itself, resolved
 * the timezone, chose today, and fetched rules, accounts and categories before it
 * could render a heading. All of that is now `RecurringData`, in the browser.
 *
 * `searchParams` is gone. This page used to read `?error=` because
 * `deleteRecurringAction` and `postOccurrenceAction` used to redirect with the
 * failure in the URL — and no page in this app reads `searchParams`, so that error
 * was never displayed anywhere. Both actions return `{ error }` now and render the
 * message inside the form that failed (ADR-037).
 */
export default function RecurringPage() {
  return (
    <div className="tk-stack">
      <RecurringData />
    </div>
  )
}
