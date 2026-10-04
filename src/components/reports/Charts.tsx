/**
 * Income vs expense per month.
 *
 * Deliberately CSS rather than a charting library. Both series here are simple
 * bars, and a library would add roughly 100 KB of client JavaScript to a mobile
 * app aimed at users on metered connections. If the reports grow genuinely
 * complex charts, add a library then — this component has one clear entry point
 * to replace.
 *
 * A grouped bar chart rather than two lines: twelve monthly figures are
 * comparisons, not a trend to be read continuously, and lines imply a
 * smoothness between months that spending does not have.
 *
 * Accessibility: the figure is a table for screen readers, and the bars are
 * decorative. Colour is never the only channel — income and expense are also
 * labelled, and both series keep a shape (income solid, expense rounded top)
 * so they stay distinguishable in greyscale.
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

  // One month of data is not a trend. The bars still render — the figures are
  // real — but the chart is labelled for what it is rather than implying a
  // comparison that was never made.
  const single = points.length < 2

  return (
    <div className="flex flex-col gap-4">
      {single && <p className="tk-caption">One month so far. Add more to see a trend.</p>}

      <div
        className="flex items-end gap-1 overflow-x-auto"
        role="img"
        aria-label={
          single
            ? `Income and expense for ${points[0]?.label ?? 'this month'}`
            : `Income and expense per month across ${points.length} months`
        }
      >
        {points.map((p) => (
          <div key={p.label} className="flex min-w-14 flex-1 flex-col items-center gap-1.5">
            <div className="flex h-36 w-full items-end justify-center gap-0.5">
              <div
                className="w-1/2 rounded-t-[6px] bg-[var(--hue-brand)]"
                style={{ height: `${(p.income / peak) * 100}%` }}
              />
              <div
                className="bg-expense w-1/2 rounded-t-full"
                style={{ height: `${(p.expense / peak) * 100}%` }}
              />
            </div>
            <span className="tk-caption">{p.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[5px] bg-[var(--hue-brand)]" aria-hidden="true" />
          <span className="tk-caption">Income</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-expense h-2.5 w-2.5 rounded-full" aria-hidden="true" />
          <span className="tk-caption">Expense</span>
        </span>
      </div>

      {/* The actual numbers, available to assistive tech and to anyone who
          wants the precise figures rather than a bar height. */}
      <table className="w-full text-xs">
        <caption className="sr-only">Income and expense per month</caption>
        <thead>
          <tr className="text-muted">
            <th scope="col" className="py-1.5 font-medium">
              Month
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Income
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Expense
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Saved
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.label} className="border-hairline border-t">
              <td className="py-1.5">{p.label}</td>
              <td className="py-1.5 text-right tabular-nums">{formatMoney(p.income)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatMoney(p.expense)}</td>
              <td
                className={`py-1.5 text-right tabular-nums ${
                  p.income - p.expense < 0 ? 'text-expense' : 'text-income'
                }`}
              >
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
 *
 * The bar is a share-of-largest, not a share-of-total, so the smallest category
 * is still visible. A share-of-total bar makes a 0.4% category a 2px sliver,
 * which reads as "no data" rather than "a little".
 */
export function CategoryBars({
  rows,
  total,
  formatMoney,
  tone = 'brand',
}: {
  rows: { name: string; total: number; count: number }[]
  total: number
  formatMoney: (minor: number) => string
  tone?: 'brand' | 'rose'
}) {
  const peak = Math.max(1, ...rows.map((r) => r.total))

  // `.tk-progress-bar` and friends carry `height: 100%`. Naming only a colour
  // class here renders a fill with no height, which reads as an empty track —
  // the worst possible failure for a chart, since it looks like real data.
  const fill = tone === 'rose' ? 'tk-progress-bar-expense' : 'tk-progress-bar-income'

  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map((r) => {
        const share = total > 0 ? (r.total / total) * 100 : 0
        return (
          <li key={r.name} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="tk-body truncate font-medium">{r.name}</span>
              <span className="shrink-0 text-right">
                <span className="tk-amount">{formatMoney(r.total)}</span>
                <span className="tk-caption ml-2">{share.toFixed(0)}%</span>
              </span>
            </div>
            <div
              className="tk-progress"
              role="img"
              aria-label={`${r.name}: ${share.toFixed(0)} percent of the period total`}
            >
              <div className={fill} style={{ width: `${(r.total / peak) * 100}%` }} />
            </div>
            {r.count > 1 && (
              <p className="tk-caption">
                {r.count} transaction{r.count === 1 ? '' : 's'}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
