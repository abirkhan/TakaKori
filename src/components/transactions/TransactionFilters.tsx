'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import type { Account, Category } from '@/lib/queries/reference'
import { SegmentedControl } from '@/components/ui/SegmentedControl'

const PERIODS = [
  { value: '', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
] as const

type PeriodValue = (typeof PERIODS)[number]['value']
type TypeValue = '' | 'income' | 'expense' | 'transfer'

const TYPES: readonly { value: TypeValue; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
]

/**
 * Filter bar.
 *
 * Filters live in the URL so a filtered view is shareable and survives a
 * refresh. Dates are computed in the user's timezone on the server, so the
 * client only sends a preset name, never a resolved boundary.
 *
 * Period and type are segmented controls and category/account are selects,
 * because that split is the point: a period is one of a handful of values the
 * user switches between constantly, while an account is a long list they look
 * up. Rendering both as dropdowns makes the common case three taps deep.
 *
 * There is no Apply button. Each change navigates immediately, because a
 * filter that needs confirming is a filter that is not being used.
 */
export function TransactionFilters({
  accounts,
  categories,
}: {
  accounts: Account[]
  categories: Category[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const current = (key: string) => searchParams.get(key) ?? ''

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('offset')
    // Wrapped in a transition so `pending` reflects the navigation and clears
    // itself when the route settles. A bare setState(true) here would latch the
    // whole filter bar into `disabled` after the first change, leaving the user
    // unable to set a second filter without a full reload.
    startTransition(() => {
      router.push(`/transactions?${params.toString()}`)
    })
  }

  const hasFilters =
    current('preset') || current('type') || current('category') || current('account')

  return (
    <section className="tk-card flex flex-col gap-3.5" aria-label="Filters">
      <SegmentedControl
        name="preset-filter"
        ariaLabel="Period"
        value={current('preset') as PeriodValue}
        options={PERIODS}
        onChange={(value) => update('preset', value)}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SegmentedControl
          name="type-filter"
          ariaLabel="Type"
          value={current('type') as TypeValue}
          options={TYPES}
          onChange={(value) => update('type', value)}
        />

        <label className="flex flex-col gap-1.5">
          <span className="tk-label">Category</span>
          <select
            value={current('category')}
            onChange={(e) => update('category', e.target.value)}
            disabled={pending}
            className="tk-field tk-select"
          >
            <option value="">Any</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="tk-label">Account</span>
          <select
            value={current('account')}
            onChange={(e) => update('account', e.target.value)}
            disabled={pending}
            className="tk-field tk-select"
          >
            <option value="">Any</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            startTransition(() => {
              router.push('/transactions')
            })
          }}
          className="tk-caption text-accent self-start font-medium"
        >
          Clear filters
        </button>
      )}
    </section>
  )
}

// Re-exported because consumers historically imported the type from here
// rather than from `@/types/database`. Prefer importing it from there.
export type { TransactionType } from '@/types/database'
