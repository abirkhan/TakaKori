import { deleteRecurringAction, postOccurrenceAction } from '@/actions/planning'
import type { RecurringView } from '@/lib/queries/planning'
import { toMinor } from '@/lib/money'

function describeFrequency(r: RecurringView): string {
  const n = r.interval_count
  const unit = r.frequency === 'weekly' ? 'week' : r.frequency === 'monthly' ? 'month' : 'year'
  return n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`
}

export function RecurringCard({
  rule,
  formatMoney,
}: {
  rule: RecurringView
  formatMoney: (minor: number) => string
}) {
  return (
    <article className="rounded border border-neutral-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-medium">
            {rule.description ?? rule.category_name ?? rule.counterparty_name ?? rule.type}
          </h2>
          <p className="text-xs text-neutral-500">
            {describeFrequency(rule)}
            {rule.ends_on && ` until ${rule.ends_on}`}
            {rule.last_posted_on && ` · last posted ${rule.last_posted_on}`}
          </p>
        </div>
        <p
          className={`text-sm font-medium tabular-nums ${
            rule.type === 'income' ? 'text-emerald-700' : 'text-red-700'
          }`}
        >
          {rule.type === 'income' ? '+' : '−'}
          {formatMoney(toMinor(rule.amount))}
        </p>
      </div>

      {rule.due.length > 0 ? (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">Due to post</p>
          <ul className="mt-2 flex flex-col gap-2">
            {rule.due.map((occ) => (
              <li key={occ.date} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-amber-900 tabular-nums">
                  {occ.date}
                  {occ.clamped && (
                    <span className="ml-2 text-xs text-amber-700">
                      (short month, moved to last day)
                    </span>
                  )}
                </span>
                <form action={postOccurrenceAction}>
                  <input type="hidden" name="id" value={rule.id} />
                  <input type="hidden" name="occurrenceDate" value={occ.date} />
                  <button
                    type="submit"
                    className="rounded bg-amber-800 px-2 py-1 text-xs text-white hover:bg-amber-900"
                  >
                    Post this
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-xs text-neutral-500">
          Nothing due. Next on {rule.nextDate ?? 'no further dates'}.
        </p>
      )}

      {rule.upcoming.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-neutral-500 underline">Upcoming</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {rule.upcoming.map((occ) => (
              <li key={occ.date} className="text-xs text-neutral-500 tabular-nums">
                {occ.date}
                {occ.clamped && (
                  <span className="ml-2 text-neutral-400">(last day of a short month)</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <form action={deleteRecurringAction} className="mt-3 flex justify-end">
        <input type="hidden" name="id" value={rule.id} />
        <button type="submit" className="text-xs text-red-600 underline">
          Delete rule
        </button>
      </form>
    </article>
  )
}
