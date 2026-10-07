'use client'

import Link from 'next/link'
import { formatMinor, toMinor } from '@/lib/money'
import {
  addDaysTo,
  formatDayLabel,
  monthLabel,
  resolveRange,
  startOfMonthOffset,
  todayIn,
} from '@/lib/dates'
import { transactionSubtitle } from '@/lib/transaction-view'
import {
  getAccountBalances,
  getProfile,
  getTotalsForRange,
  listTransactions,
} from '@/lib/queries/client'
import { useQuery } from '@/lib/client/useQuery'
import { keys } from '@/lib/client/invalidations'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Row } from '@/components/ui/Row'
import { Icon } from '@/components/ui/Icon'
import { amountClass, amountSign } from '@/components/ui/button'

/**
 * The dashboard's data, loaded in the browser.
 *
 * This is the screen that shows what the two-phase load actually costs, and it
 * is worth being explicit about because it is the reason the other five screens
 * are not a mechanical copy of `/accounts`.
 *
 * **Phase one: the profile.** Every figure here is formatted in the user's
 * currency and every range is resolved in their timezone, and both live in
 * `profiles`. So nothing else can be requested until that resolves. The queries
 * below are keyed on `null` until then, and `useQuery` reports `loading` without
 * firing anything — so there is one loading state for the screen rather than
 * four racing ones.
 *
 * **Phase two: the numbers.** Four requests in parallel once the timezone is
 * known, keyed by the range they describe, so switching months later is a
 * different cache entry rather than a refetch of the same key.
 *
 * Everything below the data — the "Plan" links, the section headings, the grid —
 * stays in the Server Component, because none of it depends on the profile and
 * all of it should be in the document before the bundle arrives.
 */

/** The profile, and from it the timezone every other query is keyed on. */
function useProfile() {
  return useQuery(keys.profile(), () => getProfile())
}

/**
 * Range-scoped figures.
 *
 * `key` is `null` until the timezone exists, which is the whole point: the
 * range cannot be computed without it, and computing it against a guess is how
 * "this month" ends up wrong by a day at either boundary.
 */
function useMonthTotals(timezone: string | null) {
  return useQuery(
    timezone === null ? null : `totals:${timezone}:${describeRange(resolveMonth(timezone))}`,
    () => getTotalsForRange(resolveMonth(timezone!)),
  )
}

function usePreviousMonthTotals(timezone: string | null) {
  return useQuery(
    timezone === null
      ? null
      : `totals:${timezone}:${describeRange(resolvePreviousMonth(timezone))}`,
    () => getTotalsForRange(resolvePreviousMonth(timezone!)),
  )
}

/** 'month' never returns null; this narrows it for the RPC. */
function resolveMonth(timezone: string) {
  const range = resolveRange('month', timezone)
  if (!range) throw new Error('Failed to resolve the current month range')
  return range
}

/**
 * The previous calendar month, for a like-for-like comparison.
 *
 * Both boundaries come from the same helpers that resolved the current month,
 * rather than from a second month-arithmetic path written inline — which is how
 * two screens end up disagreeing about where a month begins.
 */
function resolvePreviousMonth(timezone: string) {
  const month = resolveMonth(timezone)
  return {
    from: startOfMonthOffset(todayIn(timezone), 1),
    to: addDaysTo(month.from, -1, timezone),
  }
}

function describeRange(range: { from: string; to: string }): string {
  return `${range.from}..${range.to}`
}

export function DashboardHeader() {
  const profile = useProfile()
  const timezone = profile.data?.timezone ?? null

  if (!profile.data) {
    // A skeleton rather than a placeholder name. "Dashboard" is a claim about
    // who you are; the empty string is not, and flashing the wrong greeting is
    // worse than showing none.
    return (
      <PageHeader
        eyebrow={timezone ? formatDayLabel(todayIn(timezone), timezone) : ' '}
        title="TakaKori"
      />
    )
  }

  const first = profile.data.full_name?.split(' ')[0]
  return (
    <PageHeader
      eyebrow={formatDayLabel(todayIn(profile.data.timezone), profile.data.timezone)}
      title={first ? `Hello, ${first}` : 'Dashboard'}
    />
  )
}

export function DashboardSummary() {
  const profile = useProfile()
  const timezone = profile.data?.timezone ?? null
  const currency = profile.data?.currency ?? 'BDT'

  const totals = useMonthTotals(timezone)
  const previous = usePreviousMonthTotals(timezone)
  const balances = useQuery(keys.balances(), () => getAccountBalances())

  const money = (minor: number) => formatMinor(minor, { currency })

  // Month figures come from a SQL aggregate scoped to the range. Summing the
  // lifetime view here would mislabel every number on this screen.
  const monthNet = toMinor(totals.data?.net_balance ?? 0)
  const monthIncome = toMinor(totals.data?.total_income ?? 0)
  const monthExpense = toMinor(totals.data?.total_expense ?? 0)
  const totalBalance = (balances.data ?? []).reduce((sum, b) => sum + toMinor(b.balance), 0)

  // Percentage change against the same month a month ago. Null rather than zero
  // when there is nothing to compare against: "0% change" against a previous
  // month with no spending is a claim, and it is a false one (ADR-011's voice).
  const previousExpense = toMinor(previous.data?.total_expense ?? 0)
  const changePercent =
    previousExpense > 0
      ? Math.round(((monthExpense - previousExpense) / previousExpense) * 100)
      : null

  const loading = totals.loading || balances.loading || previous.loading

  return (
    <section className="tk-card">
      {/* The headline is the month's *outcome*, not its spending. A user opening
          a money app wants one sentence about whether they are okay, so the
          verdict leads, in words and a number, with spending underneath as the
          supporting detail. Overspending leads with the overspend, because that
          is the case which needs a decision. */}
      <p className="tk-eyebrow">
        {timezone && !loading
          ? `${monthNet >= 0 ? 'You kept' : 'You overspent'} in ${monthLabel(resolveMonth(timezone).from)}`
          : 'This month'}
      </p>

      {/* `—` while loading, never ৳0. A zero balance and an unresolved one look
          identical, and only one of them is true. */}
      <p
        className={`tk-money-lg mt-1.5 ${loading ? '' : monthNet >= 0 ? 'tk-income' : 'tk-expense'}`}
        data-money
      >
        {loading ? '—' : money(Math.abs(monthNet))}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!loading && monthIncome > 0 && (
          <span className="tk-badge tk-badge-neutral">of {money(monthIncome)} earned</span>
        )}

        {!loading &&
          (changePercent !== null ? (
            <span
              className={`tk-badge ${changePercent <= 0 ? 'tk-badge-income' : 'tk-badge-expense'}`}
            >
              <Icon name={changePercent <= 0 ? 'arrowDownLeft' : 'arrowUpRight'} size={12} />
              {Math.abs(changePercent)}% {changePercent <= 0 ? 'below' : 'above'} last month
            </span>
          ) : (
            <span className="tk-badge tk-badge-neutral">First month tracked</span>
          ))}
      </div>

      <div className="tk-divider my-4" />

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="tk-eyebrow">Spent</p>
          <p className="tk-amount-lg mt-0.5">{loading ? '—' : money(monthExpense)}</p>
        </div>
        <div className="text-right">
          <p className="tk-eyebrow">Total balance</p>
          <p className="tk-amount-lg mt-0.5" data-balance>
            {loading ? '—' : money(totalBalance)}
          </p>
        </div>
      </div>

      {balances.data && (
        <p className="tk-caption mt-2">
          Across {balances.data.length} account{balances.data.length === 1 ? '' : 's'}
        </p>
      )}
    </section>
  )
}

export function RecentTransactions() {
  const profile = useProfile()
  const currency = profile.data?.currency ?? 'BDT'
  const recent = useQuery(keys.transactions('recent:6'), () => listTransactions({ limit: 6 }))

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="tk-section">Recent transactions</h2>
        {/* `tk-link`, not a bare caption: this was a 17px-tall target and it is
            the primary way from Home to the transaction list. */}
        <Link href="/transactions" className="tk-link">
          See all
          <Icon name="chevronRight" size={14} className="ml-0.5" />
        </Link>
      </div>

      {recent.error && (
        <EmptyState
          icon="alert"
          title="Could not load your transactions"
          description={recent.error}
        />
      )}

      {!recent.error && !recent.data && (
        <ul className="tk-card tk-list divide-hairline flex flex-col divide-y" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="tk-row">
              <span className="tk-tile tk-tone-brand" />
              <div className="min-w-0 flex-1">
                <p className="tk-caption">Loading…</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {recent.data?.length === 0 && (
        <EmptyState
          icon="receipt"
          title="Nothing recorded yet"
          description="Add your first expense or payment and it will appear here."
          action={
            <Link href="/transactions?sheet=add" className="tk-btn tk-btn-soft mt-1">
              <Icon name="plus" size={16} />
              Add a transaction
            </Link>
          }
        />
      )}

      {recent.data && recent.data.length > 0 && (
        <ul className="tk-card tk-list divide-hairline flex flex-col divide-y">
          {recent.data.map((t) => (
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
                // The same rule as `/transactions`, so one record never reads two
                // ways on two screens.
                subtitle={transactionSubtitle(t)}
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
  )
}

export function AccountsList() {
  const profile = useProfile()
  const currency = profile.data?.currency ?? 'BDT'
  const balances = useQuery(keys.balances(), () => getAccountBalances())

  if (!balances.data || balances.data.length === 0) return null

  return (
    <section>
      <h2 className="tk-section mb-3">Accounts</h2>
      <ul className="tk-card tk-list divide-hairline flex flex-col divide-y">
        {balances.data.map((b) => (
          <li key={b.account_id}>
            <Row
              title={b.name}
              titleAttribute={b.name}
              subtitle={b.kind.replace('_', ' ')}
              trailing={
                <span className="tk-amount">{formatMinor(toMinor(b.balance), { currency })}</span>
              }
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
