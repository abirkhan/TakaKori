'use client'

import {
  getExpenseByCategory,
  getIncomeByCategory,
  getProfile,
  listCategories,
} from '@/lib/queries/client'
import { useQuery } from '@/lib/client/useQuery'
import { keys } from '@/lib/client/invalidations'
import { monthLabel, resolveRange } from '@/lib/dates'
import { formatMinor, toMinor, type Minor } from '@/lib/money'
import { toneFor } from '@/lib/tone'
import { CategoryForm } from '@/components/categories/CategoryForm'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon, type IconName } from '@/components/ui/Icon'
import { CategoryEditSheet } from '@/components/categories/CategoryEditSheet'
import { buttonClass } from '@/components/ui/button'
import type { Category } from '@/lib/queries/reference'
import { useState } from 'react'

/**
 * Categories, loaded in the browser.
 *
 * **The one screen with no two-phase load, and that is not an oversight.** Every
 * other converted screen needs the profile first, because a figure has to be
 * formatted in the user's currency and a date range has to be resolved in the
 * user's timezone. This screen shows names. There is no currency and no range,
 * so there is nothing to wait for and the first paint is already the real thing.
 *
 * **No "last synced" line either, deliberately.** The other screens render one
 * because a stale *figure* is the dangerous kind of stale — a balance that reads
 * as live when it is not. A stale category name is cosmetic: the worst outcome is
 * that a category created on another device is missing until the next reload, and
 * nothing the user relies on to make a decision is wrong. Adding the timestamp
 * anyway would train people to ignore it on the screens where it matters.
 */
export function CategoryData() {
  const categories = useQuery(keys.categories(), () => listCategories())
  const [editing, setEditing] = useState<string | null>(null)

  /**
   * Two-phase, like every screen that shows a figure.
   *
   * **The month is a range in the user's timezone**, so it cannot be resolved
   * until the profile lands — the same reason `/dashboard` and `/reports` gate on it.
   * Keyed on the resolved range rather than on `'month'`, so the read is a cache
   * entry per period rather than one entry that silently means different dates in
   * different months.
   */
  const profile = useQuery(keys.profile(), () => getProfile())
  const timezone = profile.data?.timezone ?? null
  const currency = profile.data?.currency ?? 'BDT'
  const monthRange = timezone ? resolveRange('month', timezone) : null

  const spend = useQuery(
    monthRange && timezone
      ? keys.report(timezone, monthRange.from, monthRange.to, 'expenseByCategory')
      : null,
    () => getExpenseByCategory({ from: monthRange!.from, to: monthRange!.to }),
  )
  const incomeSpend = useQuery(
    monthRange && timezone
      ? keys.report(timezone, monthRange.from, monthRange.to, 'incomeByCategory')
      : null,
    () => getIncomeByCategory({ from: monthRange!.from, to: monthRange!.to }),
  )

  const data = categories.data
  const income = data?.filter((c) => c.type === 'income') ?? []
  const expense = data?.filter((c) => c.type === 'expense') ?? []

  /**
   * Money per category, for this month.
   *
   * **Aggregated in SQL, read from the same RPC the Reports screen uses**, and
   * keyed identically — so a category total here and the bar on `/reports` are the
   * same number from the same cache entry, not two independently-agreed-upon sums.
   * Summing rows in the browser is the one thing `lib/money.ts` exists to prevent.
   *
   * The two lists are keyed by `category_id` rather than by name: a rename moves
   * the name and leaves the id, so joining on the name would drop a category's
   * spending the moment it was corrected — which is the exact bug the rename feature
   * was added to fix.
   */
  const totalsFor = (
    rows: { category_id: string | null; total: string | number; tx_count: number }[] | null,
  ): Map<string, { total: Minor; count: number }> => {
    const map = new Map<string, { total: Minor; count: number }>()
    for (const r of rows ?? []) {
      if (!r.category_id) continue
      const prev = map.get(r.category_id)
      map.set(r.category_id, {
        total: toMinor(r.total) + (prev?.total ?? 0),
        count: (prev?.count ?? 0) + r.tx_count,
      })
    }
    return map
  }

  const expenseTotals = totalsFor(spend.data)
  const incomeTotals = totalsFor(incomeSpend.data)

  const periodLabel = monthRange ? monthLabel(monthRange.from) : ''
  const ready = spend.data !== null && incomeSpend.data !== null

  return (
    <>
      <PageHeader eyebrow={data ? `${data.length} total` : ' '} title="Categories" />

      <section className="tk-card">
        <CategoryForm />
      </section>

      {categories.error && (
        <EmptyState
          icon="alert"
          title="Could not load your categories"
          description={categories.error}
        />
      )}

      {!categories.error && !data && (
        <div className="tk-card" aria-busy="true">
          <span className="tk-caption">Loading your categories…</span>
        </div>
      )}

      {data &&
        [
          {
            title: 'Expense',
            items: expense,
            icon: 'arrowUpRight' as IconName,
            totals: expenseTotals,
          },
          {
            title: 'Income',
            items: income,
            icon: 'arrowDownLeft' as IconName,
            totals: incomeTotals,
          },
        ].map((group) => {
          /**
           * Ordered by this month's spending, largest first.
           *
           * **Only once the figures have landed.** Sorting before then would order by
           * nothing and then not re-sort, leaving the grid alphabetical exactly when
           * the numbers appeared — the ordering the sort was for would never apply.
           * Unspent categories keep their alphabetical order at the end, which is
           * where a category nobody has used belongs.
           *
           * The share is against the largest category, not the total, for the same
           * reason the Reports bars are: a share-of-total makes a 1% category a 2px
           * sliver, which reads as "no data" rather than "a little".
           */
          const ordered = ready
            ? [...group.items].sort((a, b) => {
                const av = group.totals.get(a.id)?.total ?? 0
                const bv = group.totals.get(b.id)?.total ?? 0
                if (av !== bv) return bv - av
                return a.name.localeCompare(b.name)
              })
            : group.items

          const peak = Math.max(1, ...ordered.map((c) => group.totals.get(c.id)?.total ?? 0))

          return (
            <section key={group.title}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="tk-section">{group.title}</h2>
                {ready && <span className="tk-caption">{periodLabel}</span>}
              </div>

              {group.items.length === 0 ? (
                <EmptyState
                  icon={group.icon}
                  title={`No ${group.title.toLowerCase()} categories`}
                  description="Add one above — it will appear in the transaction form."
                />
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {ordered.map((c) => {
                    const entry = group.totals.get(c.id)
                    const amount = entry?.total ?? 0
                    const count = entry?.count ?? 0

                    return (
                      <li
                        key={c.id}
                        className="tk-card flex flex-col items-center gap-2 p-4 text-center"
                      >
                        <span className={`tk-tile tk-tile-lg tk-tone-${toneFor(c.name)}`}>
                          <Icon name="tag" size={20} />
                        </span>
                        <p className="tk-body w-full truncate font-medium">{c.name}</p>

                        {/**
                         * The month's figure, or a dash before the figures land.
                         *
                         * `ready ? amount : '—'` rather than ৳0.00, for the reason the
                         * dashboard uses: a zero and an unresolved read look identical
                         * and only one of them is true. Once loaded, a genuine ৳0.00 is
                         * shown — that is a real answer meaning "not used this month".
                         */}
                        <p className="tk-amount-muted" data-category-amount>
                          {ready ? formatMinor(amount, { currency }) : '—'}
                        </p>

                        {ready && count > 0 && (
                          <div
                            className="tk-progress w-full"
                            role="img"
                            aria-label={`${c.name}: ${Math.round((amount / peak) * 100)} percent of your largest ${group.title.toLowerCase()} category this month`}
                          >
                            <div
                              className={
                                group.title === 'Expense'
                                  ? 'tk-progress-bar-expense'
                                  : 'tk-progress-bar-income'
                              }
                              style={{ width: `${(amount / peak) * 100}%` }}
                            />
                          </div>
                        )}

                        {/*
                          A rename is the commonest correction on this screen, and before
                          this there was no way to make one: a category created with the
                          wrong name kept it, and transactions follow `category_id`, so
                          every past row showed the wrong label too. Built-in categories
                          are left alone - they are seeded, so renaming one would be undone
                          by the next seed and the user cannot know that.
                        */}
                        {!c.is_system && (
                          <button
                            type="button"
                            onClick={() => setEditing(c.id)}
                            className={buttonClass('quiet', { size: 'sm' })}
                          >
                            Edit
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}

        {editing && categories.data && (
          <CategoryEditSheet
            category={categories.data.find((c) => c.id === editing) as Category}
            open
            onClose={() => setEditing(null)}
          />
        )}
    </>
  )
}
