/**
 * Income vs expense per month.
 *
 * Deliberately CSS rather than a charting library. Both series here are simple
 * bars, and a library would add roughly 100 KB of client JavaScript to a mobile
 * app aimed at users on metered connections. If the reports grow genuinely
 * complex charts, add a library then — this component has one clear entry point
 * to replace.
 *
 * Accessibility: the figure is a table for screen readers, and the bars are
 * decorative. Colour is never the only channel — income and expense are also
 * labelled.
 */

export interface MonthPoint {
  label: string
  income: number
  expense: number
  /** Whether this month had no transactions at all. */
  empty: boolean
}

export function MonthlyTrend({
  points,
  formatMoney,
}: {
  points: MonthPoint[]
  formatMoney: (minor: number) => string
}) {
  const peak = Math.max(1, ...points.flatMap((p) => [p.income, p.expense]))

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex items-end gap-1 overflow-x-auto"
        role="img"
        aria-label={`Income and expense per month across ${points.length} months`}
      >
        {points.map((p) => (
          <div key={p.label} className="flex min-w-14 flex-1 flex-col items-center gap-1">
            <div className="flex h-32 w-full items-end justify-center gap-0.5">
              <div
                className="w-1/2 rounded-t bg-emerald-600"
                style={{ height: `${(p.income / peak) * 100}%` }}
              />
              <div
                className="w-1/2 rounded-t bg-red-500"
                style={{ height: `${(p.expense / peak) * 100}%` }}
              />
            </div>
            <span className="text-xs text-neutral-500">{p.label}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-4 text-xs text-neutral-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" aria-hidden="true" />
          Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-500" aria-hidden="true" />
          Expense
        </span>
      </div>

      {/* The actual numbers, available to assistive tech and to anyone who
          wants the precise figures rather than a bar height. */}
      <table className="w-full text-xs">
        <caption className="sr-only">Income and expense per month</caption>
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th scope="col" className="py-1 font-normal">Month</th>
            <th scope="col" className="py-1 text-right font-normal">Income</th>
            <th scope="col" className="py-1 text-right font-normal">Expense</th>
            <th scope="col" className="py-1 text-right font-normal">Saved</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.label} className="border-b border-neutral-100">
              <td className="py-1">{p.label}</td>
              <td className="py-1 text-right tabular-nums">{formatMoney(p.income)}</td>
              <td className="py-1 text-right tabular-nums">{formatMoney(p.expense)}</td>
              <td className="py-1 text-right tabular-nums">
                {formatMoney(p.income - p.expense)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Horizontal bars for a category breakdown.
 *
 * `total` drives the bar width; `share` is the percentage of the period's total
 * spend, shown as text because a bare bar is not readable on its own.
 */
export function CategoryBars({
  rows,
  total,
  formatMoney,
}: {
  rows: { name: string; total: number; count: number }[]
  total: number
  formatMoney: (minor: number) => string
}) {
  const peak = Math.max(1, ...rows.map((r) => r.total))

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => {
        const share = total > 0 ? (r.total / total) * 100 : 0
        return (
          <li key={r.name} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>{r.name}</span>
              <span className="tabular-nums text-neutral-600">
                {formatMoney(r.total)}
                <span className="ml-2 text-xs text-neutral-400">
                  {share.toFixed(0)}%
                </span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-neutral-800"
                style={{ width: `${(r.total / peak) * 100}%` }}
              />
            </div>
            {r.count > 1 && (
              <span className="text-xs text-neutral-400">
                {r.count} transaction{r.count === 1 ? '' : 's'}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}