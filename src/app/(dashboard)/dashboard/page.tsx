import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMinor, toMinor } from '@/lib/money'
import { resolveRange, todayIn } from '@/lib/dates'
import { listTransactions } from '@/lib/queries/transactions'
import { getAccountBalances, getTotalsForRange } from '@/lib/queries/reference'

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
  const month = resolveRange('month', timezone)

  if (!month) {
    // 'month' never returns null; this narrows the type for the RPC below.
    throw new Error('Failed to resolve the current month range')
  }

  // Month figures come from a SQL aggregate scoped to the range. Summing the
  // lifetime view here would mislabel every number on this page.
  const [recent, balances, monthTotals] = await Promise.all([
    listTransactions({ limit: 8 }),
    getAccountBalances(),
    getTotalsForRange(month),
  ])

  const monthIncome = toMinor(monthTotals?.total_income ?? 0)
  const monthExpense = toMinor(monthTotals?.total_expense ?? 0)
  const monthNet = toMinor(monthTotals?.net_balance ?? 0)
  const totalBalance = balances.reduce((sum, b) => sum + toMinor(b.balance), 0)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">
          {profile?.full_name ? `Hello, ${profile.full_name}` : 'Dashboard'}
        </h1>
        <p className="text-sm text-neutral-500">{todayIn(timezone)}</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded border border-neutral-200 p-4">
          <p className="text-sm text-neutral-500">Total balance</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatMinor(totalBalance, { currency })}
          </p>
        </div>

        <div className="rounded border border-neutral-200 p-4">
          <p className="text-sm text-neutral-500">This month — income</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">
            {formatMinor(monthIncome, { currency })}
          </p>
        </div>

        <div className="rounded border border-neutral-200 p-4">
          <p className="text-sm text-neutral-500">This month — expense</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-red-700">
            {formatMinor(monthExpense, { currency })}
          </p>
        </div>
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <p className="text-sm text-neutral-500">
          Saved this month ({month.from} to {month.to})
        </p>
        <p className="mt-1 text-lg font-medium tabular-nums">
          {formatMinor(monthNet, { currency })}
        </p>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Recent transactions</h2>
          <Link href="/transactions" className="text-sm underline">
            View all
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            No transactions yet.{' '}
            <Link href="/transactions" className="underline">
              Add your first one
            </Link>
            .
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 font-normal">Date</th>
                <th className="py-2 font-normal">Description</th>
                <th className="py-2 font-normal">Category</th>
                <th className="py-2 text-right font-normal">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id} className="border-b border-neutral-100">
                  <td className="py-2 whitespace-nowrap text-neutral-600">{t.occurred_on}</td>
                  <td className="py-2">
                    {t.description ?? (
                      <span className="text-neutral-400">
                        {t.type === 'transfer' ? 'Transfer' : (t.category?.name ?? 'Uncategorised')}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-neutral-600">
                    {t.type === 'transfer' ? 'Transfer' : (t.category?.name ?? '—')}
                  </td>
                  <td
                    className={`py-2 text-right font-medium tabular-nums ${
                      t.type === 'income'
                        ? 'text-emerald-700'
                        : t.type === 'expense'
                          ? 'text-red-700'
                          : 'text-neutral-500'
                    }`}
                  >
                    {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}
                    {formatMinor(toMinor(t.amount), { currency, withSymbol: false })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {balances.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium">Accounts</h2>
          <ul className="flex flex-col gap-2">
            {balances.map((b) => (
              <li
                key={b.account_id}
                className="flex items-center justify-between rounded border border-neutral-200 px-4 py-3 text-sm"
              >
                <span>{b.name}</span>
                <span className="font-medium tabular-nums">
                  {formatMinor(toMinor(b.balance), { currency })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}