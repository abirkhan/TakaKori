import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMinor, toMinor } from '@/lib/money'
import {
  resolveRange,
  startOfMonthOffset,
  todayIn,
  type DateRangePreset,
} from '@/lib/dates'
import {
  getExpenseByCategory,
  getIncomeByCategory,
  getMonthlyTotals,
  getPeriodSummary,
} from '@/lib/queries/reports'
import { CategoryBars, MonthlyTrend } from '@/components/reports/Charts'

const PERIODS = [
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'year', label: 'This year' },
  { value: 'last12', label: 'Last 12 months' },
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
  const preset = (isLast12 ? 'month' : raw) as DateRangePreset

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

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <nav className="flex flex-wrap gap-1 text-sm">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={`/reports?period=${p.value}`}
              aria-current={raw === p.value ? 'page' : undefined}
              className={`rounded border px-3 py-1.5 ${
                raw === p.value
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-300 hover:bg-neutral-50'
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      <p className="-mt-4 text-sm text-neutral-500">
        {reportRange.from} to {reportRange.to}
      </p>

      {!hasData ? (
        <p className="rounded border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          Nothing recorded in this period.{' '}
          <Link href="/transactions" className="underline">
            Add a transaction
          </Link>
          .
        </p>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-4">
            {[
              { label: 'Income', value: income, tone: 'text-emerald-700' },
              { label: 'Expense', value: expense, tone: 'text-red-700' },
              { label: 'Saved', value: saved, tone: saved >= 0 ? 'text-emerald-700' : 'text-red-700' },
              {
                label: 'Savings rate',
                value: null,
                text: savingsRate === null ? '—' : `${savingsRate.toFixed(0)}%`,
                tone: (savingsRate ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700',
              },
            ].map((card) => (
              <div key={card.label} className="rounded border border-neutral-200 p-4">
                <p className="text-sm text-neutral-500">{card.label}</p>
                <p className={`mt-1 text-xl font-semibold tabular-nums ${card.tone}`}>
                  {'value' in card && card.value !== null ? money(card.value) : card.text}
                </p>
              </div>
            ))}
          </section>

          <section className="rounded border border-neutral-200 p-4">
            <h2 className="mb-4 text-lg font-medium">Income vs expense by month</h2>
            <MonthlyTrend
              points={points.map((p) => ({ ...p, label: shortLabel(p.label) }))}
              formatMoney={money}
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded border border-neutral-200 p-4">
              <h2 className="mb-4 text-lg font-medium">Where the money went</h2>
              {expenseByCategory.length === 0 ? (
                <p className="text-sm text-neutral-500">No expenses in this period.</p>
              ) : (
                <CategoryBars
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

            <section className="rounded border border-neutral-200 p-4">
              <h2 className="mb-4 text-lg font-medium">Where it came from</h2>
              {incomeByCategory.length === 0 ? (
                <p className="text-sm text-neutral-500">No income in this period.</p>
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
            <p className="text-sm text-neutral-500">
              {money(transferred)} moved between accounts in this period. Transfers are
              not counted as income or spending.
            </p>
          )}
        </>
      )}
    </div>
  )
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function shortLabel(ym: string): string {
  const [year, month] = ym.split('-')
  return `${MONTH_NAMES[Number(month) - 1] ?? month} ${year.slice(2)}`
}