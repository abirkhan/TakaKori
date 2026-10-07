'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { formatMinor, toMinor } from '@/lib/money'
import { resolveRange, startOfMonthOffset, todayIn, monthLabel } from '@/lib/dates'
import {
  getExpenseByCategory,
  getIncomeByCategory,
  getMonthlyTotals,
  getPeriodSummary,
  getProfile,
} from '@/lib/queries/client'
import { useQuery } from '@/lib/client/useQuery'
import { keys } from '@/lib/client/invalidations'
import { CategoryBars, MonthlyTrend } from '@/components/reports/Charts'
import { ProgressRing } from '@/components/ui/ProgressRing'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatTile } from '@/components/ui/StatTile'
import { EmptyState } from '@/components/ui/EmptyState'

const PERIODS = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
  { value: 'last12', label: '12 months' },
] as const

/**
 * Reports, loaded in the browser.
 *
 * **Three phases, and the first one is the profile.** Every figure here is
 * formatted in the user's currency, and every date range is resolved in the user's
 * timezone (ADR-006) — so `today` cannot be known until the profile lands, and
 * none of the four reads can be keyed until it does.
 *
 * "12 months" is the one that most needs this. It is a *rolling* window anchored on
 * the current month, so the same URL means different dates in different months, and
 * two users in different timezones get different ranges from the same link. That is
 * why the key carries the timezone, the from, and the to, and why nothing here is
 * keyed by `?period=last12` alone.
 *
 * **All four reads sit under `totals:`**, so a transaction write clears them with
 * the rest of the money. They carry a `kind` so they cannot overwrite the
 * dashboard's own range total, which is a different read of the same range.
 *
 * The period control is links, not buttons or a select, and stays links in a client
 * component on purpose: an `<a>` works before hydration and after it, so the range
 * is still chosen by a real navigation if JavaScript is slow or absent.
 */
function ReportsBody() {
  const searchParams = useSearchParams()
  const profile = useQuery(keys.profile(), () => getProfile())
  const timezone = profile.data?.timezone
  const currency = profile.data?.currency ?? 'BDT'
  const money = (minor: number) => formatMinor(minor, { currency })

  const raw = searchParams.get('period') ?? 'month'

  const isLast12 = raw === 'last12'
  const preset = (isLast12 ? 'month' : raw) as Parameters<typeof resolveRange>[0]

  // `null` until the profile lands, which is the two-phase load: `useQuery` treats
  // a null key as "still loading" and fetches nothing, so there is no request under
  // a key a second timezone would have to share.
  const range = timezone ? resolveRange(preset, timezone) : null
  const today = timezone ? todayIn(timezone) : null
  const reportRange =
    range && today && isLast12 ? { from: startOfMonthOffset(today, 11), to: range.to } : range

  const tz = timezone ?? ''
  const from = reportRange?.from ?? ''
  const to = reportRange?.to ?? ''

  const summary = useQuery(reportRange ? keys.report(tz, from, to, 'summary') : null, () =>
    getPeriodSummary({ from, to }),
  )
  const monthly = useQuery(reportRange ? keys.report(tz, from, to, 'monthly') : null, () =>
    getMonthlyTotals({ from, to }),
  )
  const expenseByCategory = useQuery(
    reportRange ? keys.report(tz, from, to, 'expenseByCategory') : null,
    () => getExpenseByCategory({ from, to }),
  )
  const incomeByCategory = useQuery(
    reportRange ? keys.report(tz, from, to, 'incomeByCategory') : null,
    () => getIncomeByCategory({ from, to }),
  )

  // Numeric arrives from Postgres as a string, so it must go through toMinor
  // before any comparison. `total_transferred > 0` on a string is meaningless.
  const income = summary.data ? toMinor(summary.data.total_income) : 0
  const expense = summary.data ? toMinor(summary.data.total_expense) : 0
  const transferred = summary.data ? toMinor(summary.data.total_transferred) : 0
  const saved = income - expense

  // Percentage of income kept. Negative means overspending, which is the case that
  // most needs to be visible rather than hidden behind a minus sign.
  const savingsRate = income > 0 ? (saved / income) * 100 : null

  // Share of income kept, as a fraction for the ring. Null when there was no income:
  // a savings rate against zero is not a low rate, it is undefined, and rendering it
  // as 0% would read as "you saved nothing" rather than "there was nothing to save".
  const savingsShare = income > 0 ? Math.min(1, Math.max(0, saved / income)) : null

  const expenseTotalMinor = (expenseByCategory.data ?? []).reduce((s, r) => s + toMinor(r.total), 0)
  const incomeTotalMinor = (incomeByCategory.data ?? []).reduce((s, r) => s + toMinor(r.total), 0)

  const points = (monthly.data ?? []).map((m) => ({
    label: m.month.slice(0, 7),
    income: toMinor(m.total_income),
    expense: toMinor(m.total_expense),
    empty: m.tx_count === 0,
  }))

  const ready =
    summary.data !== null &&
    monthly.data !== null &&
    expenseByCategory.data !== null &&
    incomeByCategory.data !== null
  const hasData = (monthly.data ?? []).some((m) => m.tx_count > 0)

  const activePeriod = PERIODS.find((p) => p.value === raw) ?? PERIODS[0]
  const rangeError = timezone && !resolveRange(preset, timezone)

  return (
    <>
      <PageHeader eyebrow="Analytics" title="Reports">
        {rangeError
          ? 'Reports require a bounded period'
          : reportRange
            ? activePeriod.label === 'Month'
              ? monthLabel(reportRange.from)
              : `${reportRange.from} to ${reportRange.to}`
            : ''}
      </PageHeader>

      {/* `tk-segment-scroll` rather than `tk-segment`, because four options with
          these labels do not fit a 320px screen — the narrowest still shipping —
          and a control that overflows its card is worse than one that scrolls. */}
      <nav aria-label="Period" className="tk-segment-scroll">
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            href={`/reports?period=${p.value}`}
            className="tk-segment-item"
            data-active={raw === p.value}
            aria-current={raw === p.value ? 'page' : undefined}
          >
            {p.label}
          </Link>
        ))}
      </nav>

      {!ready && !summary.error && (
        <div className="tk-card" aria-busy="true">
          <span className="tk-caption">Loading your reports…</span>
        </div>
      )}

      {summary.error && (
        <EmptyState icon="alert" title="Could not load your reports" description={summary.error} />
      )}

      {ready && !hasData && (
        <EmptyState
          icon="chart"
          title="Nothing recorded in this period"
          description="Once there is a month of transactions, the trends and breakdowns appear here."
          action={
            <Link href="/transactions#add" className="tk-btn tk-btn-soft tk-btn-sm mt-1">
              Add a transaction
            </Link>
          }
        />
      )}

      {ready && hasData && (
        <>
          <section className="tk-card">
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
              {savingsShare !== null && (
                <ProgressRing
                  value={savingsShare}
                  tone={saved >= 0 ? 'brand' : 'rose'}
                  label="Savings rate: share of income kept"
                  size={168}
                  stroke={15}
                >
                  {/* "Savings rate" is the name for this figure, not "Saved", which
                      is the taka amount below it. Naming both the same way makes the
                      ring read as a second money total. */}
                  <p className="tk-eyebrow">Savings rate</p>
                  <p className="tk-money mt-0.5">
                    {savingsRate === null ? '—' : `${savingsRate.toFixed(0)}%`}
                  </p>
                  <p className="tk-caption mt-0.5">{money(saved)} kept</p>
                </ProgressRing>
              )}

              <div className="flex w-full flex-1 items-start gap-3">
                <StatTile icon="arrowDownLeft" tone="brand" label="Income" value={money(income)} />
                <StatTile icon="arrowUpRight" tone="rose" label="Expense" value={money(expense)} />
              </div>
            </div>
          </section>

          <section className="tk-card">
            <h2 className="tk-section mb-4">
              {points.length < 2 ? 'This month' : 'Income vs expense by month'}
            </h2>
            <MonthlyTrend
              points={points.map((p) => ({ ...p, label: shortLabel(p.label) }))}
              formatMoney={money}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="tk-card">
              <h2 className="tk-section mb-4">Where the money went</h2>
              {(expenseByCategory.data ?? []).length === 0 ? (
                <p className="tk-body text-muted">No expenses in this period.</p>
              ) : (
                <CategoryBars
                  tone="rose"
                  rows={(expenseByCategory.data ?? []).map((r) => ({
                    name: r.category_name,
                    total: toMinor(r.total),
                    count: r.tx_count,
                  }))}
                  total={expenseTotalMinor}
                  formatMoney={money}
                />
              )}
            </section>

            <section className="tk-card">
              <h2 className="tk-section mb-4">Where it came from</h2>
              {(incomeByCategory.data ?? []).length === 0 ? (
                <p className="tk-body text-muted">No income in this period.</p>
              ) : (
                <CategoryBars
                  rows={(incomeByCategory.data ?? []).map((r) => ({
                    name: r.category_name,
                    total: toMinor(r.total),
                    count: r.tx_count,
                  }))}
                  total={incomeTotalMinor}
                  formatMoney={money}
                />
              )}
            </section>
          </div>

          {transferred > 0 && (
            <p className="tk-caption">
              {money(transferred)} moved between accounts in this period. Transfers are not counted
              as income or spending.{' '}
              <Link href="/transactions?type=transfer" className="text-accent font-medium">
                See them
              </Link>
              .
            </p>
          )}
        </>
      )}

      {/* Every number on this screen is a SQL aggregate that cannot run offline
          (ADR-004), so a cached read is the last one the *database* produced. The
          timestamp is what separates "this is your figure" from "this is your
          figure as of twenty minutes ago". */}
      {summary.stale && summary.at !== null && (
        <p className="tk-caption" role="status">
          Last synced {new Date(summary.at).toLocaleTimeString()}.
        </p>
      )}
    </>
  )
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function shortLabel(ym: string): string {
  const [year, month] = ym.split('-')
  return `${MONTH_NAMES[Number(month) - 1] ?? month} ${year.slice(2)}`
}

/**
 * `useSearchParams` suspends during static rendering, so it needs a Suspense
 * boundary or the build fails with a prerender error. The fallback is the shell
 * rather than a spinner — a spinner would say "loading" on a screen that renders
 * perfectly well without JavaScript.
 */
export function ReportsData() {
  return (
    <Suspense fallback={null}>
      <ReportsBody />
    </Suspense>
  )
}
