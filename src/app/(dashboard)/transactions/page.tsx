import { Suspense } from 'react'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayIn, resolveRange, type DateRangePreset } from '@/lib/dates'
import { formatMinor, toMinor, toNumericString } from '@/lib/money'
import { listAccounts, listCategories } from '@/lib/queries/reference'
import { listTransactions } from '@/lib/queries/transactions'
import { TransactionForm } from '@/components/transactions/TransactionForm'
import { TransactionFilters } from '@/components/transactions/TransactionFilters'
import { deleteTransactionAction } from '@/actions/transactions'
import { EditTransactionForm } from '@/components/transactions/EditTransactionForm'
import type { TransactionType } from '@/types/database'

const PAGE_SIZE = 50

// `searchParams` is a promise in Next 16.
type SearchParams = Promise<Record<string, string | string[] | undefined>>

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value || undefined
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
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

  // The preset is resolved server-side in the user's timezone. The client never
  // computes a boundary, so there is no way for a stale client clock to shift
  // "this month" by a day.
  const preset = (one(params.preset) ?? 'all') as DateRangePreset
  const range = resolveRange(preset, timezone)

  const offset = Number(one(params.offset) ?? 0) || 0

  const [accounts, categories, transactions] = await Promise.all([
    listAccounts(),
    listCategories(),
    listTransactions({
      from: range?.from,
      to: range?.to,
      type: one(params.type) as TransactionType | undefined,
      categoryId: one(params.category),
      accountId: one(params.account),
      limit: PAGE_SIZE,
      offset,
    }),
  ])

  // Page size + 1 tells us whether a next page exists without a second count.
  const hasMore = transactions.length > PAGE_SIZE
  const visible = hasMore ? transactions.slice(0, PAGE_SIZE) : transactions

  const queryFor = (nextOffset: number) => {
    const sp = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      const v = one(value)
      if (v && key !== 'offset') sp.set(key, v)
    }
    if (nextOffset > 0) sp.set('offset', String(nextOffset))
    const qs = sp.toString()
    return qs ? `/transactions?${qs}` : '/transactions'
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <a
          href="/api/export/csv"
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Export CSV
        </a>
      </div>

      <section className="rounded border border-neutral-200 p-4">
        <TransactionForm accounts={accounts} categories={categories} today={todayIn(timezone)} />
      </section>

      <Suspense fallback={<div className="text-sm text-neutral-400">Loading filters…</div>}>
        <TransactionFilters accounts={accounts} categories={categories} />
      </Suspense>

      <section>
        <h2 className="mb-3 text-lg font-medium">
          {range ? `Showing ${visible.length} (${range.from} to ${range.to})` : `All time (${visible.length})`}
        </h2>

        {visible.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Nothing matches these filters.
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
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.id} className="border-b border-neutral-100">
                    <td className="py-2 whitespace-nowrap text-neutral-600">{t.occurred_on}</td>
                    <td className="py-2">
                      {t.description ?? <span className="text-neutral-400">—</span>}
                    </td>
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
                      <details className="relative">
                        <summary className="cursor-pointer text-xs underline">Edit</summary>
                        <div className="absolute right-0 z-10 mt-1 rounded border border-neutral-200 bg-white p-3 shadow-lg">
                          <EditTransactionForm
                            transaction={{
                              id: t.id,
                              type: t.type,
                              amount: toNumericString(toMinor(t.amount), currency),
                              description: t.description,
                              occurred_on: t.occurred_on,
                            }}
                          />
                        </div>
                      </details>
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

        {(offset > 0 || hasMore) && (
          <nav className="mt-4 flex gap-2 text-sm">
            {offset > 0 && (
              <a href={queryFor(Math.max(0, offset - PAGE_SIZE))} className="underline">
                Previous
              </a>
            )}
            {hasMore && (
              <a href={queryFor(offset + PAGE_SIZE)} className="underline">
                Next
              </a>
            )}
          </nav>
        )}
      </section>
    </div>
  )
}