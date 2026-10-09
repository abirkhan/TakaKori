'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { todayIn, resolveRange, monthLabel, type DateRangePreset } from '@/lib/dates'
import { formatMinor, toMinor, toNumericString } from '@/lib/money'
import { transactionSubtitle } from '@/lib/transaction-view'
import { getProfile, listAccounts, listCategories, listTransactions } from '@/lib/queries/client'
import { useQuery } from '@/lib/client/useQuery'
import { keys } from '@/lib/client/invalidations'
import { TransactionFilters } from '@/components/transactions/TransactionFilters'
import { TransactionSheetHost } from '@/components/transactions/TransactionSheetHost'
import { TransactionList, type TransactionRowView } from '@/components/transactions/TransactionList'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { amountSign, buttonClass } from '@/components/ui/button'
import type { TransactionType } from '@/types/database'

const PAGE_SIZE = 50

/**
 * Transactions, loaded in the browser.
 *
 * **The screen where the cache key is the whole risk.** Six others were converted
 * with a key that named a range and a page size; this one has eight inputs, and
 * the one that gets forgotten is `offset`. Drop it and page 2 is served page 1's
 * rows — the heading still reads "Latest 50", every row is a genuine transaction,
 * and the user is reading a page they already read. Nothing in the UI looks wrong.
 *
 * So `keys.transactionList` takes an object, which turns a missing input into a
 * type error instead of a stale page. See that builder for why the inputs are not
 * positional.
 *
 * **`resolveRange` runs in the browser now, and the comment that justified running
 * it on the server is worth re-reading.** It used to say the client must never
 * compute a boundary "so there is no way for a stale client clock to shift this
 * month by a day". That is still handled, but by a different mechanism: the range
 * is derived from `profiles.timezone`, and `todayIn` reads the device's *current*
 * date in that zone. A device whose clock is wrong gets a wrong month — which is
 * why the profile is the gate on every one of these reads, and why an offline
 * launch without a persisted profile shows nothing rather than guessing.
 *
 * Money is still formatted here, in the browser, through `formatMinor` — never in
 * SQL and never as a raw `numeric` (ADR-004). Formatting used to happen on the
 * server and cross into the client as a finished string; that is the one piece of
 * this screen that genuinely moved, and it is why the currency is now needed
 * before the list can render.
 */
function TransactionsBody() {
  const searchParams = useSearchParams()

  const profile = useQuery(keys.profile(), () => getProfile())
  const timezone = profile.data?.timezone ?? 'Asia/Dhaka'
  const currency = profile.data?.currency ?? 'BDT'

  const accounts = useQuery(keys.accounts(), () => listAccounts())
  const categories = useQuery(keys.categories(), () => listCategories())

  const preset = (searchParams.get('preset') ?? 'all') as DateRangePreset
  const range = resolveRange(preset, timezone)

  const offset = Number(searchParams.get('offset') ?? 0) || 0
  const type = (searchParams.get('type') as TransactionType | undefined) ?? undefined
  const categoryId = searchParams.get('category') ?? undefined
  const accountId = searchParams.get('account') ?? undefined

  const listKey = keys.transactionList({
    timezone,
    from: range?.from,
    to: range?.to,
    type,
    categoryId,
    accountId,
    limit: PAGE_SIZE,
    offset,
  })

  const list = useQuery(listKey, () =>
    listTransactions({
      from: range?.from,
      to: range?.to,
      type,
      categoryId,
      accountId,
      limit: PAGE_SIZE,
      offset,
    }),
  )

  const money = (minor: number) => formatMinor(minor, { currency, withSymbol: false })

  // Page size + 1 tells us whether a next page exists without a second count.
  const fetched = list.data ?? []
  const hasMore = fetched.length > PAGE_SIZE
  const visible = hasMore ? fetched.slice(0, PAGE_SIZE) : fetched

  const rows: TransactionRowView[] = visible.map((t) => ({
    id: t.id,
    formattedAmount: money(toMinor(t.amount)),
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

  /** Preserves the current filters and swaps the page. */
  const queryFor = (nextOffset: number) => {
    const sp = new URLSearchParams(searchParams.toString())
    sp.delete('sheet')
    if (nextOffset > 0) sp.set('offset', String(nextOffset))
    else sp.delete('offset')
    const qs = sp.toString()
    return qs ? `/transactions?${qs}` : '/transactions'
  }

  const periodLabel = range
    ? preset === 'month'
      ? monthLabel(range.from)
      : `${range.from} to ${range.to}`
    : 'All time'

  const ready = list.data !== null

  return (
    <>
      <PageHeader
        eyebrow={ready ? `${visible.length} shown` : ' '}
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

            {/* A plain `<a>`, not a Link: it points at an API route that returns a
                file, and a client-side navigation would fetch it through the router
                and try to render it as a page. */}
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

      <Suspense fallback={<div className="tk-card animate-fade h-24" aria-hidden="true" />}>
        {/*
         * Rendered only once the reference lists have landed, not with
         * `?? []`. Both are dropdowns built by `.map`, so an empty array produces
         * a `<select>` with no options — a filter bar that looks broken, and on a
         * cold cache or a metered connection that is the first paint.
         */}
        {accounts.data && categories.data ? (
          <TransactionFilters accounts={accounts.data} categories={categories.data} />
        ) : null}
      </Suspense>

      {/* Writes held on this device used to render here, above the list. They are not
          transactions — no server id, not in any total, not filtered or paged — so
          rendering them as rows would imply they had been counted, which is still why
          they sit outside the list. But they are now in the root layout, because nine of
          the ten queueable writes are not transactions and a parked row on /categories
          had to be invisible until the user happened to open this screen. See
          `components/app/PendingWrites`. */}

      {/* The list owns the screen. Adding a transaction used to be a six-field form
          occupying the entire first screenful of the screen the user opened to
          *look at* their transactions; it is a sheet now, opened by the tab bar's
          floating action. */}
      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="tk-section">
            {!ready
              ? 'Loading'
              : visible.length === 0
                ? 'Nothing here yet'
                : `Latest ${visible.length}`}
          </h2>
          <span className="tk-caption">{hasMore ? 'Newest first' : null}</span>
        </div>

        {list.error ? (
          <EmptyState
            icon="alert"
            title="Could not load your transactions"
            description={list.error}
            action={
              <Link href="/transactions" className="tk-link mt-1">
                Clear all filters
              </Link>
            }
          />
        ) : !ready ? (
          <div className="tk-card animate-fade h-24" aria-busy="true" />
        ) : visible.length === 0 ? (
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

        {ready && (offset > 0 || hasMore) && (
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

      {/*
       * The sheet lives on this page rather than in the layout, so the accounts and
       * categories it needs are fetched here and nowhere else. Its open state is
       * `?sheet=add`, read inside the host from the URL.
       *
       * **Gated on the profile and both reference lists, and this is the one place
       * the cold-cache case would have bitten.** `?sheet=add` is a real link — the
       * header's Add button and the tab bar's floating action both point at it — so
       * a deep link or a fast tap on a first visit opens the sheet before any of
       * that has loaded. Passing `?? []` gives the form two dropdowns with no
       * options in them: the user is looking at a form they cannot fill in, on the
       * screen's primary action.
       *
       * It is not a data-integrity problem — `accountId` is a required `uuid`, so
       * the save is rejected server-side — but it is the worst possible first
       * impression on a metered connection, which is this app's whole audience.
       * Waiting costs one animation's delay; showing an empty form costs the user.
       *
       * `today` depends on the profile too, so gating on it also means the date
       * default in the form is the user's, not a `Asia/Dhaka` fallback that might
       * silently become the value.
       */}
      <Suspense fallback={null}>
        {profile.data && accounts.data && categories.data ? (
          <TransactionSheetHost
            accounts={accounts.data}
            categories={categories.data}
            today={todayIn(profile.data.timezone)}
          />
        ) : null}
      </Suspense>

      {/* Every row here is money, and every row is the last one the *database*
          produced — all aggregation lives in SQL that cannot run offline
          (ADR-004). Showing the cached list without saying when it was captured is
          how a stale figure gets read as a live one. */}
      {list.stale && list.at !== null && (
        <p className="tk-caption" role="status">
          Last synced {new Date(list.at).toLocaleTimeString()}.
        </p>
      )}
    </>
  )
}

/**
 * `useSearchParams` suspends during static rendering, so it needs a Suspense
 * boundary or the build fails. The fallback is null rather than a skeleton: the
 * shell is already on screen from this Server Component, and a second loading
 * placeholder inside it reads as a flicker.
 */
export function TransactionData() {
  return (
    <Suspense fallback={null}>
      <TransactionsBody />
    </Suspense>
  )
}
