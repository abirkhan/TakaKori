import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayIn } from '@/lib/dates'
import { formatMinor, toMinor } from '@/lib/money'
import { listAccounts, listCategories } from '@/lib/queries/reference'
import { listTransactions } from '@/lib/queries/transactions'
import { TransactionForm } from '@/components/transactions/TransactionForm'
import { deleteTransactionAction } from '@/actions/transactions'

export default async function TransactionsPage() {
  const { userId } = await requireUser()

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone, currency')
    .eq('id', userId)
    .single()

  const timezone = profile?.timezone ?? 'Asia/Dhaka'
  const currency = profile?.currency ?? 'BDT'

  const [accounts, categories, transactions] = await Promise.all([
    listAccounts(),
    listCategories(),
    listTransactions({ limit: 100 }),
  ])

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Transactions</h1>

      <section className="rounded border border-neutral-200 p-4">
        <TransactionForm
          accounts={accounts}
          categories={categories}
          today={todayIn(timezone)}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">
          History ({transactions.length})
        </h2>

        {transactions.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Nothing here yet. Add a transaction above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 font-normal">Date</th>
                  <th className="py-2 font-normal">Description</th>
                  <th className="py-2 font-normal">Category</th>
                  <th className="py-2 font-normal">Account</th>
                  <th className="py-2 text-right font-normal">Amount</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-neutral-100">
                    <td className="py-2 whitespace-nowrap text-neutral-600">{t.occurred_on}</td>
                    <td className="py-2">{t.description ?? <span className="text-neutral-400">—</span>}</td>
                    <td className="py-2 text-neutral-600">
                      {t.type === 'transfer'
                        ? `→ ${t.counterparty_account?.name ?? '?'}`
                        : (t.category?.name ?? '—')}
                    </td>
                    <td className="py-2 text-neutral-600">{t.account?.name ?? '—'}</td>
                    <td
                      className={`py-2 text-right font-medium whitespace-nowrap tabular-nums ${
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
                    <td className="py-2 text-right">
                      <form action={deleteTransactionAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <button type="submit" className="text-xs text-red-600 underline">
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}