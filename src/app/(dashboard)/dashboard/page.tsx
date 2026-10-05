import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMinor, toMinor } from '@/lib/money'
import {
  resolveRange,
  todayIn,
  addDaysTo,
  startOfMonthOffset,
  formatDayLabel,
  monthLabel,
} from '@/lib/dates'
import { listTransactions } from '@/lib/queries/transactions'
import { getAccountBalances, getTotalsForRange } from '@/lib/queries/reference'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatTile } from '@/components/ui/StatTile'
import { EmptyState } from '@/components/ui/EmptyState'
import { Row, RowLink } from '@/components/ui/Row'
import { Icon } from '@/components/ui/Icon'
import { amountClass, amountSign } from '@/components/ui/button'

export default async function DashboardPage() {
  // Authorisation. The proxy already redirects unauthenticated users, but a
  // matcher change must never become an authz hole, so it is re-checked here.
  const { userId } = await requireUser()

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, timezone, currency')
    .eq('id', userId)
    .single()

  // All ranges are resolved in the user's timezone, never UTC.
  const timezone = profile?.timezone ?? 'Asia/Dhaka'
  const currency = profile?.currency ?? 'BDT'
  const today = todayIn(timezone)
  const month = resolveRange('month', timezone)

  if (!month) {
    // 'month' never returns null; this narrows the type for the RPC below.
    throw new Error('Failed to resolve the current month range')
  }

  // The previous calendar month, for a like-for-like comparison. Both
  // boundaries come from the same helpers that resolved the current month,
  // rather than from a second month-arithmetic path written inline here.
  const previousMonth = {
    from: startOfMonthOffset(today, 1),
    to: addDaysTo(month.from, -1, timezone),
  }

  // Month figures come from a SQL aggregate scoped to the range. Summing the
  // lifetime view here would mislabel every number on this page.
  const [recent, balances, monthTotals, previousTotals] = await Promise.all([
    listTransactions({ limit: 6 }),
    getAccountBalances(),
    getTotalsForRange(month),
    getTotalsForRange(previousMonth),
  ])

  const monthIncome = toMinor(monthTotals?.total_income ?? 0)
  const monthExpense = toMinor(monthTotals?.total_expense ?? 0)
  const monthNet = toMinor(monthTotals?.net_balance ?? 0)
  const totalBalance = balances.reduce((sum, b) => sum + toMinor(b.balance), 0)

  // Percentage change against the same month a month ago. Null rather than zero
  // when there is nothing to compare against: "0% change" against a previous
  // month with no spending is a claim, and it is a false one.
  const previousExpense = toMinor(previousTotals?.total_expense ?? 0)
  const changePercent =
    previousExpense > 0
      ? Math.round(((monthExpense - previousExpense) / previousExpense) * 100)
      : null

  const money = (minor: number) => formatMinor(minor, { currency })

  return (
    <div className="tk-stack">
      <PageHeader
        eyebrow={formatDayLabel(today, timezone)}
        title={profile?.full_name ? `Hello, ${profile.full_name.split(' ')[0]}` : 'Dashboard'}
      />

      {/* Two columns from `lg`. A single column stretched to 72rem puts a
          transaction's amount 900px from its description, which reads worse than
          the phone layout it replaced. The primary column stays the wider of the
          two because the spending figures are what the screen is for.

          `grid-cols-1` is load-bearing rather than a default. With no explicit
          column definition the implicit track is `auto`, which is floored at its
          content's min-content width — and a transaction row's min-content is
          ~430px, because the nowrap amount and the truncating title cannot
          shrink past it. On a 390px phone that made the whole page 459px wide
          and scrollable sideways. `minmax(0, 1fr)` lets the track shrink below
          its content, which is what makes the truncation inside the rows work. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="tk-stack">
          {/* The headline is spending, not balance. Balance answers "do I have
              money"; spend answers "am I okay", which is the question a user
              opens a tracker to ask. */}
          <section className="tk-card">
            <p className="tk-eyebrow">Spent in {monthLabel(month.from)}</p>
            <p className="tk-money-lg mt-1.5">{money(monthExpense)}</p>

            {changePercent !== null ? (
              <p className="mt-2">
                <span
                  className={`tk-badge ${changePercent <= 0 ? 'tk-badge-income' : 'tk-badge-expense'}`}
                >
                  <Icon name={changePercent <= 0 ? 'arrowDownLeft' : 'arrowUpRight'} size={12} />
                  {Math.abs(changePercent)}% {changePercent <= 0 ? 'below' : 'above'} last month
                </span>
              </p>
            ) : (
              <p className="tk-caption mt-2">No spending recorded last month.</p>
            )}

            <div className="tk-divider my-4" />

            <div className="tk-card-flat">
              <p className="tk-eyebrow">Total balance</p>
              <p className="tk-money mt-1" data-balance>
                {money(totalBalance)}
              </p>
              <p className="tk-caption mt-1">
                Across {balances.length} account{balances.length === 1 ? '' : 's'}
              </p>
            </div>
          </section>

          <section className="tk-card">
            <div className="flex items-start gap-3 sm:gap-5">
              <StatTile
                icon="arrowDownLeft"
                tone="brand"
                label="Income"
                value={money(monthIncome)}
              />
              <StatTile
                icon="arrowUpRight"
                tone="rose"
                label="Expenses"
                value={money(monthExpense)}
              />
              <StatTile
                icon={monthNet >= 0 ? 'wallet' : 'alert'}
                tone={monthNet >= 0 ? 'teal' : 'amber'}
                label="Saved"
                value={money(monthNet)}
              />
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="tk-section">Recent transactions</h2>
              <Link href="/transactions" className="tk-caption text-accent font-medium">
                See all
              </Link>
            </div>

            {recent.length === 0 ? (
              <EmptyState
                icon="receipt"
                title="Nothing recorded yet"
                description="Add your first expense or payment and it will appear here."
                action={
                  <Link href="/transactions#add" className="tk-btn tk-btn-soft tk-btn-sm mt-1">
                    <Icon name="plus" size={16} />
                    Add a transaction
                  </Link>
                }
              />
            ) : (
              <ul className="tk-card divide-hairline flex flex-col divide-y p-1">
                {recent.map((t) => (
                  <li key={t.id}>
                    <Row
                      icon={
                        t.type === 'transfer'
                          ? 'repeat'
                          : t.type === 'income'
                            ? 'arrowDownLeft'
                            : 'arrowUpRight'
                      }
                      tone={t.type === 'income' ? 'brand' : t.type === 'transfer' ? 'sky' : 'rose'}
                      title={t.description ?? t.category?.name ?? 'Transfer'}
                      subtitle={`${t.occurred_on} Â· ${t.account?.name ?? 'No account'}`}
                      trailing={
                        <span className={amountClass(t.type)}>
                          {amountSign(t.type)}
                          {formatMinor(toMinor(t.amount), { currency, withSymbol: false })}
                        </span>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="tk-stack">
          {balances.length > 0 && (
            <section>
              <h2 className="tk-section mb-3">Accounts</h2>
              <ul className="tk-card divide-hairline flex flex-col divide-y p-1">
                {balances.map((b) => (
                  <li key={b.account_id}>
                    <Row
                      title={b.name}
                      titleAttribute={b.name}
                      subtitle={b.kind.replace('_', ' ')}
                      trailing={<span className="tk-amount">{money(toMinor(b.balance))}</span>}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Everything that is not a top-level tab still needs a home, and "set
              something up" belongs in one place rather than in a header menu. */}
          <section>
            <h2 className="tk-section mb-3">Plan</h2>
            <div className="tk-card divide-hairline flex flex-col divide-y p-1">
              <RowLink
                href="/budgets"
                icon="target"
                tone="amber"
                title="Budgets"
                subtitle="Monthly limits and pace"
              />
              <RowLink
                href="/recurring"
                icon="repeat"
                tone="violet"
                title="Recurring"
                subtitle="Rent, salary, subscriptions"
              />
              <RowLink
                href="/categories"
                icon="tag"
                tone="teal"
                title="Categories"
                subtitle="How your spending is labelled"
              />
              <RowLink
                href="/reports"
                icon="chart"
                tone="sky"
                title="Reports"
                subtitle="Trends and breakdowns"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
