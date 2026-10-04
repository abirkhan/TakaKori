import { Suspense } from 'react'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayIn, resolveRange, monthLabel, type DateRangePreset } from '@/lib/dates'
import { formatMinor, toMinor, toNumericString } from '@/lib/money'
import { listAccounts, listCategories } from '@/lib/queries/reference'
import { listTransactions } from '@/lib/queries/transactions'
import { TransactionForm } from '@/components/transactions/TransactionForm'
import { TransactionFilters } from '@/components/transactions/TransactionFilters'
import { deleteTransactionAction } from '@/actions/transactions'
import { EditTransactionForm } from '@/components/transactions/EditTransactionForm'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { Row } from '@/components/ui/Row'
import { amountClass, amountSign, buttonClass } from '@/components/ui/button'
import type { TransactionType } from '@/types/database'

const PAGE_SIZE = 50

// `searchParams` is a promise in Next 16.
type SearchParams = Promise<Record<string, string | string[] | undefined>>

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value || undefined
}

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  const { userId } = await requireUser()
  const params = await searchParams
  const actionError = typeof params.error === 'string' ? params.error : null

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

  const periodLabel = range
    ? preset === 'month'
      ? monthLabel(range.from)
      : `${range.from} to ${range.to}`
    : 'All time'

  return (
    <div className="tk-stack">
      <PageHeader
        eyebrow={`${visible.length} shown`}
        title="Transactions"
        action={
          <a
            href="/api/export/csv"
            className={buttonClass('quiet', { size: 'sm' })}
            aria-label="Export as CSV"
          >
            <Icon name="download" size={16} />
            <span className="hidden sm:inline">Export CSV</span>
          </a>
        }
      >
        {periodLabel}
      </PageHeader>

      {/* The add form is first and always open: this is the action the tab bar's
          floating button points at, and `#add` is where it lands. */}
      <section className="tk-card scroll-mt-20">
        <TransactionForm accounts={accounts} categories={categories} today={todayIn(timezone)} />
      </section>

      {actionError && (
        <p role="alert" className="tk-alert tk-alert-error">
          <Icon name="alert" size={17} className="mt-px shrink-0" />
          <span>{actionError}</span>
        </p>
      )}

      <Suspense fallback={<div className="tk-card animate-fade h-24" aria-hidden="true" />}>
        <TransactionFilters accounts={accounts} categories={categories} />
      </Suspense>

      <section>
        {visible.length === 0 ? (
          <EmptyState
            icon="receipt"
            title="Nothing matches these filters"
            description="Widen the period, or clear the filters to see everything."
          />
        ) : (
          <ul className="tk-card divide-hairline flex flex-col divide-y p-1">
            {visible.map((t) => (
              <li key={t.id} className="flex flex-col">
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
                  titleAttribute="tx-description"
                  subtitle={[
                    t.occurred_on,
                    t.type === 'transfer'
                      ? `→ ${t.counterparty_account?.name ?? '?'}`
                      : (t.category?.name ?? undefined),
                    t.account?.name ?? undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={
                    <span className={amountClass(t.type)}>
                      {amountSign(t.type)}
                      {formatMinor(toMinor(t.amount), { currency, withSymbol: false })}
                    </span>
                  }
                />

                {/* Edit and delete sit behind one disclosure. A row with two
                    always-visible actions puts eight competing targets in a list
                    of four, and a permanent delete control on a financial
                    record is the wrong default: the row's job is to be read, and
                    reading is what this screen is for.

                    Both are plain `<form action={serverAction}>` elements, so
                    they work with no client JavaScript at all. */}
                <details className="group -mt-1 mb-1 ml-[3.625rem]">
                  <summary className="tk-caption rounded-pill text-accent inline-flex cursor-pointer list-none items-center gap-1 py-1.5 font-medium">
                    <Icon name="sliders" size={13} />
                    Edit or remove
                    <Icon
                      name="chevronDown"
                      size={13}
                      className="transition-transform group-open:rotate-180"
                    />
                  </summary>

                  <div className="tk-card-flat mt-1.5 flex flex-col gap-3">
                    <EditTransactionForm
                      transaction={{
                        id: t.id,
                        type: t.type,
                        amount: toNumericString(toMinor(t.amount), currency),
                        description: t.description,
                        occurred_on: t.occurred_on,
                      }}
                    />

                    <form
                      action={deleteTransactionAction}
                      className="border-hairline flex items-center justify-between gap-3 border-t pt-3"
                    >
                      <span className="tk-caption">Removes this record permanently.</span>
                      <button type="submit" className={buttonClass('danger', { size: 'sm' })}>
                        <Icon name="trash" size={15} />
                        Delete
                      </button>
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}

        {(offset > 0 || hasMore) && (
          <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
            {offset > 0 ? (
              <a
                href={queryFor(Math.max(0, offset - PAGE_SIZE))}
                className={buttonClass('quiet', { size: 'sm' })}
              >
                <Icon name="chevronRight" size={15} className="rotate-180" />
                Previous
              </a>
            ) : (
              <span />
            )}
            {hasMore && (
              <a
                href={queryFor(offset + PAGE_SIZE)}
                className={buttonClass('quiet', { size: 'sm' })}
              >
                Next
                <Icon name="chevronRight" size={15} />
              </a>
            )}
          </nav>
        )}
      </section>
    </div>
  )
}
