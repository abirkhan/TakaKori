import { Suspense } from 'react'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayIn, resolveRange, monthLabel, type DateRangePreset } from '@/lib/dates'
import { formatMinor, toMinor, toNumericString } from '@/lib/money'
import { listAccounts, listCategories } from '@/lib/queries/reference'
import { listTransactions } from '@/lib/queries/transactions'
import { transactionSubtitle } from '@/lib/transaction-view'
import { TransactionFilters } from '@/components/transactions/TransactionFilters'
import { TransactionSheetHost } from '@/components/transactions/TransactionSheetHost'
import { TransactionList, type TransactionRowView } from '@/components/transactions/TransactionList'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { amountSign, buttonClass } from '@/components/ui/button'
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

  // Formatting happens here, on the server, and crosses into the client as a
  // finished string. `formatMinor` is the only thing that turns money into text
  // (ADR-004), and this component never sees a `numeric`.
  const rows: TransactionRowView[] = visible.map((t) => ({
    id: t.id,
    formattedAmount: formatMinor(toMinor(t.amount), { currency, withSymbol: false }),
    sign: amountSign(t.type),
    tone: t.type,
    title: t.description ?? t.category?.name ?? 'Transfer',
    // One rule for what a transaction row's second line says, shared with the
    // dashboard so the two screens cannot drift apart on the same record.
    subtitle: transactionSubtitle(t),
    occurredOn: t.occurred_on,
    editAmount: toNumericString(toMinor(t.amount), currency),
    description: t.description,
  }))

  return (
    <div className="tk-stack">
      <PageHeader
        eyebrow={`${visible.length} shown`}
        title="Transactions"
        action={
          <>
            {/* The tab bar's floating action is `md:hidden`, so without this the
                desktop build has no way to add a transaction at all. Two triggers,
                one sheet, one URL — and the primary action of the screen sits in
                its header where the eye lands first. */}
            <Link href="/transactions?sheet=add" className={buttonClass('primary', { size: 'sm' })}>
              <Icon name="plus" size={16} />
              <span className="hidden sm:inline">Add</span>
              <span className="sr-only">Add a transaction</span>
            </Link>

            <a
              href="/api/export/csv"
              className={buttonClass('quiet', { size: 'sm' })}
              aria-label="Export as CSV"
            >
              <Icon name="download" size={16} />
              <span className="hidden lg:inline">Export CSV</span>
            </a>
          </>
        }
      >
        {periodLabel}
      </PageHeader>

      {actionError && (
        <p role="alert" className="tk-alert tk-alert-error">
          <Icon name="alert" size={17} className="mt-px shrink-0" />
          <span>{actionError}</span>
        </p>
      )}

      <Suspense fallback={<div className="tk-card animate-fade h-24" aria-hidden="true" />}>
        <TransactionFilters accounts={accounts} categories={categories} />
      </Suspense>

      {/* The list owns the screen. Adding a transaction used to be a six-field
          form occupying the entire first screenful of the screen the user opened
          to *look at* their transactions; it is a sheet now, opened by the tab
          bar's floating action. */}
      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="tk-section">
            {visible.length === 0 ? 'Nothing here yet' : `Latest ${visible.length}`}
          </h2>
          <span className="tk-caption">{hasMore ? 'Newest first' : null}</span>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon="receipt"
            title="Nothing matches these filters"
            description="Widen the period, or clear the filters to see everything."
            action={
              <Link href="/transactions" className="tk-link mt-1">
                Clear all filters
              </Link>
            }
          />
        ) : (
          <TransactionList rows={rows} />
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

      {/* The sheet lives on this page rather than in the layout, so the accounts
          and categories it needs are fetched here and nowhere else. Its open
          state is `?sheet=add`, which is what the tab bar's floating action
          links to. */}
      <Suspense fallback={null}>
        <TransactionSheetHost
          accounts={accounts}
          categories={categories}
          today={todayIn(timezone)}
        />
      </Suspense>
    </div>
  )
}
