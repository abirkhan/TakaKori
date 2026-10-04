import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMinor, toMinor } from '@/lib/money'
import { resolveRange, startOfMonthOffset, todayIn, monthLabel } from '@/lib/dates'
import {
  getExpenseByCategory,
  getIncomeByCategory,
  getMonthlyTotals,
  getPeriodSummary,
} from '@/lib/queries/reports'
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

type Params = Promise<Record<string, string | string[] | undefined>>

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v || undefined
}

export default async function ReportsPage({ searchParams }: { searchParams: Params }) {
  const { userId } = await requireUser()
  const params = await searchParams

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone, currency')
    .eq('id', userId)
    .single()

  const timezone = profile?.timezone ?? 'Asia/Dhaka'
  const currency = profile?.currency ?? 'BDT'
  const money = (minor: number) => formatMinor(minor, { currency })

  const raw = one(params.period) ?? 'month'

  // "Last 12 months" is a rolling window anchored on the current month. It is
  // resolved here on the server in the user's timezone, never on the client.
  const isLast12 = raw === 'last12'
  const preset = (isLast12 ? 'month' : raw) as Parameters<typeof resolveRange>[0]

  const range = resolveRange(preset, timezone)
  if (!range) {
    throw new Error('Reports require a bounded period')
  }

  const reportRange = isLast12
    ? { from: startOfMonthOffset(todayIn(timezone), 11), to: range.to }
    : range

  const [summary, monthly, expenseByCategory, incomeByCategory] = await Promise.all([
    getPeriodSummary(reportRange),
    getMonthlyTotals(reportRange),
    getExpenseByCategory(reportRange),
    getIncomeByCategory(reportRange),
  ])

  const income = toMinor(summary.total_income)
  const expense = toMinor(summary.total_expense)
  const saved = income - expense
  // Numeric arrives from Postgres as a string, so it must go through toMinor
  // before any comparison. `total_transferred > 0` on a string is meaningless.
  const transferred = toMinor(summary.total_transferred)

  // Percentage of income kept. Negative means overspending, which is the case
  // that most needs to be visible rather than hidden behind a minus sign.
  const savingsRate = income > 0 ? (saved / income) * 100 : null

  const expenseTotalMinor = expenseByCategory.reduce((s, r) => s + toMinor(r.total), 0)
  const incomeTotalMinor = incomeByCategory.reduce((s, r) => s + toMinor(r.total), 0)

  const points = monthly.map((m) => ({
    label: m.month.slice(0, 7),
    income: toMinor(m.total_income),
    expense: toMinor(m.total_expense),
    empty: m.tx_count === 0,
  }))

  const hasData = monthly.some((m) => m.tx_count > 0)

  // Share of income that was kept, as a fraction for the ring. Null when there
  // was no income: a savings rate against zero is not a low rate, it is
  // undefined, and rendering it as 0% would read as "you saved nothing" rather
  // than "there was nothing to save".
  const savingsShare = income > 0 ? Math.min(1, Math.max(0, saved / income)) : null

  const activePeriod = PERIODS.find((p) => p.value === raw) ?? PERIODS[0]

  return (
    <div className="tk-stack">
      <PageHeader eyebrow="Analytics" title="Reports">
        {activePeriod.label === 'Month'
          ? monthLabel(reportRange.from)
          : `${reportRange.from} to ${reportRange.to}`}
      </PageHeader>

      {/* The period is a segmented control of links rather than a select: it is
          the one control a user on this screen changes constantly, and four
          options should not cost a dropdown to reveal. Links keep it
          server-driven, so the range stays resolved in the user's timezone. */}
      <nav aria-label="Period" className="tk-segment">
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

      {!hasData ? (
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
      ) : (
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
                  {/* "Savings rate" is the name for this figure, not "Saved",
                      which is the taka amount below it. Naming both the same
                      way makes the ring read as a second money total. */}
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
              {monthly.length < 2 ? 'This month' : 'Income vs expense by month'}
            </h2>
            <MonthlyTrend
              points={points.map((p) => ({ ...p, label: shortLabel(p.label) }))}
              formatMoney={money}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="tk-card">
              <h2 className="tk-section mb-4">Where the money went</h2>
              {expenseByCategory.length === 0 ? (
                <p className="tk-body text-muted">No expenses in this period.</p>
              ) : (
                <CategoryBars
                  tone="rose"
                  rows={expenseByCategory.map((r) => ({
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
              {incomeByCategory.length === 0 ? (
                <p className="tk-body text-muted">No income in this period.</p>
              ) : (
                <CategoryBars
                  rows={incomeByCategory.map((r) => ({
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
    </div>
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
