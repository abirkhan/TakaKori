import { deleteBudgetAction } from '@/actions/planning'
import type { BudgetView } from '@/lib/queries/planning'
import { Alert } from '@/components/ui/Alert'
import { Icon } from '@/components/ui/Icon'

/**
 * One budget with spend, pace and projection.
 *
 * The projection is the part worth showing. "3,000 of 10,000" on the 5th reads
 * fine in isolation; "at this rate you'll reach 31,000 by month end" is what
 * actually prompts a change.
 *
 * Colour is never the only signal. Each state also has a word — over, tight,
 * on track — because a budget that is 90% spent reads as fine to anyone who
 * cannot distinguish the amber bar from the emerald one.
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
  const state = overspent ? 'expense' : onTrackToOverspend ? 'warning' : 'income'
  const barClass =
    state === 'expense'
      ? 'tk-progress-bar-expense'
      : state === 'warning'
        ? 'tk-progress-bar-warning'
        : 'tk-progress-bar-income'

  return (
    <article className="tk-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="tk-section">
          {categoryName}
          {isOverall && <span className="tk-badge tk-badge-neutral ml-2">overall</span>}
        </h2>
        <p className="tk-amount">
          {formatMoney(spent)}{' '}
          <span className="text-muted font-normal">of {formatMoney(limit)}</span>
        </p>
      </div>

      <div
        className="tk-progress mt-3"
        role="img"
        aria-label={`${percentUsed.toFixed(0)} percent of the budget used`}
      >
        <div className={barClass} style={{ width: `${barWidth}%` }} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className={overspent ? 'tk-badge tk-badge-expense' : 'tk-badge tk-badge-neutral'}>
          {overspent ? `${formatMoney(-remaining)} over` : `${formatMoney(remaining)} left`}
        </span>
        <span className="tk-badge tk-badge-neutral">{percentUsed.toFixed(0)}% used</span>
        {spent > 0 && (
          <span className="tk-badge tk-badge-neutral">{formatMoney(dailyRate)}/day</span>
        )}
      </div>

      {projected !== null && (
        <p className="tk-caption mt-3 flex items-start gap-1.5">
          <Icon
            name={onTrackToOverspend ? 'alert' : 'info'}
            size={14}
            className="mt-0.5 shrink-0"
          />
          <span>
            At {formatMoney(dailyRate)} a day you reach{' '}
            <span className={onTrackToOverspend ? 'text-warning font-semibold' : 'font-semibold'}>
              {formatMoney(projected)}
            </span>{' '}
            by month end.
          </span>
        </p>
      )}

      {!overspent && projected !== null && onTrackToOverspend && (
        <Alert tone="warning">You are spending faster than this budget allows.</Alert>
      )}

      <form action={deleteBudgetAction} className="mt-3 flex justify-end">
        <input type="hidden" name="id" value={budget.id} />
        <button type="submit" className="tk-caption text-expense font-medium">
          Remove budget
        </button>
      </form>
    </article>
  )
}
