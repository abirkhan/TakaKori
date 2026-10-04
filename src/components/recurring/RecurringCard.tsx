import { deleteRecurringAction, postOccurrenceAction } from '@/actions/planning'
import type { RecurringView } from '@/lib/queries/planning'
import { toMinor } from '@/lib/money'
import { Alert } from '@/components/ui/Alert'
import { Icon } from '@/components/ui/Icon'
import { buttonClass } from '@/components/ui/button'

function describeFrequency(r: RecurringView): string {
  const n = r.interval_count
  const unit = r.frequency === 'weekly' ? 'week' : r.frequency === 'monthly' ? 'month' : 'year'
  return n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`
}

/**
 * One recurring rule.
 *
 * Due occurrences are the point of the screen and sit at the top, with a
 * one-tap post action each. Everything else — the schedule, what comes next —
 * folds away, because a rule the user has not acted on this month does not
 * need to be read twice a week.
 */
export function RecurringCard({
  rule,
  formatMoney,
}: {
  rule: RecurringView
  formatMoney: (minor: number) => string
}) {
  return (
    <article className="tk-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="tk-section truncate">
            {rule.description ?? rule.category_name ?? rule.counterparty_name ?? rule.type}
          </h2>
          <p className="tk-caption mt-1">
            {describeFrequency(rule)}
            {rule.ends_on && ` until ${rule.ends_on}`}
            {rule.last_posted_on && ` · last posted ${rule.last_posted_on}`}
          </p>
        </div>
        <p
          className={`tk-amount-lg shrink-0 ${rule.type === 'income' ? 'tk-income' : 'tk-expense'}`}
        >
          {rule.type === 'income' ? '+' : '−'}
          {formatMoney(toMinor(rule.amount))}
        </p>
      </div>

      {rule.due.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          <Alert tone="warning">Due to post</Alert>
          <ul className="flex flex-col gap-2">
            {rule.due.map((occ) => (
              <li
                key={occ.date}
                className="rounded-field bg-warning-soft flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="text-warning text-sm font-medium tabular-nums">{occ.date}</span>
                {occ.clamped && (
                  <span className="tk-caption text-warning">short month, moved to last day</span>
                )}
                <form action={postOccurrenceAction}>
                  <input type="hidden" name="id" value={rule.id} />
                  <input type="hidden" name="occurrenceDate" value={occ.date} />
                  <button type="submit" className={buttonClass('soft', { size: 'sm' })}>
                    Post this
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="tk-caption mt-3 flex items-start gap-1.5">
          <Icon name="info" size={14} className="mt-0.5 shrink-0" />
          <span>Nothing due. Next on {rule.nextDate ?? 'no further dates'}.</span>
        </p>
      )}

      {rule.upcoming.length > 0 && (
        <details className="group mt-3">
          <summary className="tk-caption text-accent inline-flex cursor-pointer list-none items-center gap-1 font-medium">
            <Icon
              name="chevronRight"
              size={13}
              className="transition-transform group-open:rotate-90"
            />
            {rule.upcoming.length} upcoming
          </summary>
          <ul className="tk-card-flat mt-2 flex flex-col gap-1">
            {rule.upcoming.map((occ) => (
              <li key={occ.date} className="tk-caption tabular-nums">
                {occ.date}
                {occ.clamped && <span className="ml-2">(last day of a short month)</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <form action={deleteRecurringAction} className="mt-3 flex justify-end">
        <input type="hidden" name="id" value={rule.id} />
        <button type="submit" className="tk-caption text-expense font-medium">
          Delete rule
        </button>
      </form>
    </article>
  )
}
