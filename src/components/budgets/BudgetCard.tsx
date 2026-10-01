import { deleteBudgetAction } from '@/actions/planning'
import type { BudgetView } from '@/lib/queries/planning'

/**
 * One budget with spend, pace and projection.
 *
 * The projection is the part worth showing. "3,000 of 10,000" on the 5th reads
 * fine in isolation; "at this rate you'll reach 31,000 by month end" is what
 * actually prompts a change.
 */
export function BudgetCard({
  budget,
  formatMoney,
}: {
  budget: BudgetView
  formatMoney: (minor: number) => string
}) {
  const {
    categoryName,
    isOverall,
    limit,
    spent,
    remaining,
    percentUsed,
    overspent,
    projected,
    onTrackToOverspend,
    dailyRate,
  } = budget

  // Cap the bar at 100% of the width; over 100% is conveyed by colour and text.
  const barWidth = Math.min(percentUsed, 100)
  const barColour = overspent
    ? 'bg-red-600'
    : onTrackToOverspend
      ? 'bg-amber-500'
      : percentUsed > 80
        ? 'bg-amber-500'
        : 'bg-emerald-600'

  return (
    <article className="rounded border border-neutral-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">
          {categoryName}
          {isOverall && <span className="ml-2 text-xs font-normal text-neutral-400">overall</span>}
        </h2>
        <p className="text-sm tabular-nums">
          <span className="font-semibold">{formatMoney(spent)}</span>
          <span className="text-neutral-500"> of {formatMoney(limit)}</span>
        </p>
      </div>

      <div
        className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-neutral-100"
        role="img"
        aria-label={`${percentUsed.toFixed(0)} percent of the budget used`}
      >
        <div className={`h-full rounded-full ${barColour}`} style={{ width: `${barWidth}%` }} />
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className={overspent ? 'font-medium text-red-700' : 'text-neutral-600'}>
          {overspent ? `${formatMoney(-remaining)} over budget` : `${formatMoney(remaining)} left`}
        </span>
        <span className="text-neutral-500">{percentUsed.toFixed(0)}% used</span>

        {spent > 0 && <span className="text-neutral-500">{formatMoney(dailyRate)}/day so far</span>}

        {projected !== null && (
          <span className={onTrackToOverspend ? 'font-medium text-amber-700' : 'text-neutral-500'}>
            On this pace: {formatMoney(projected)} by month end
          </span>
        )}
      </div>

      {!overspent && projected !== null && onTrackToOverspend && (
        <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
          You are spending faster than this budget allows. At {formatMoney(dailyRate)} a day you
          would reach {formatMoney(projected)} by month end.
        </p>
      )}

      <form action={deleteBudgetAction} className="mt-3 flex justify-end">
        <input type="hidden" name="id" value={budget.id} />
        <button type="submit" className="text-xs text-red-600 underline">
          Remove budget
        </button>
      </form>
    </article>
  )
}
