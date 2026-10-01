'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import type { Account, Category } from '@/lib/queries/reference'
import type { TransactionType } from '@/types/database'

const PRESETS = [
  { value: '', label: 'All time' },
  { value: 'month', label: 'This month' },
  { value: 'week', label: 'This week' },
  { value: 'today', label: 'Today' },
  { value: 'year', label: 'This year' },
] as const

/**
 * Filter bar.
 *
 * Filters live in the URL so a filtered view is shareable and survives a
 * refresh. Dates are computed in the user's timezone on the server, so the
 * client only sends a preset name, never a resolved boundary.
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
  const [pending, setPending] = useState(false)

  const current = (key: string) => searchParams.get(key) ?? ''

  function update(key: string, value: string) {
    setPending(true)
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('offset')
    router.push(`/transactions?${params.toString()}`)
  }

  const hasFilters =
    current('preset') || current('type') || current('category') || current('account')

  return (
    <form className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span>Period</span>
          <select
            value={current('preset')}
            onChange={(e) => update('preset', e.target.value)}
            disabled={pending}
            className="rounded border border-neutral-300 px-3 py-2"
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Type</span>
          <select
            value={current('type')}
            onChange={(e) => update('type', e.target.value)}
            disabled={pending}
            className="rounded border border-neutral-300 px-3 py-2"
          >
            <option value="">Any</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="transfer">Transfer</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Category</span>
          <select
            value={current('category')}
            onChange={(e) => update('category', e.target.value)}
            disabled={pending}
            className="rounded border border-neutral-300 px-3 py-2"
          >
            <option value="">Any</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Account</span>
          <select
            value={current('account')}
            onChange={(e) => update('account', e.target.value)}
            disabled={pending}
            className="rounded border border-neutral-300 px-3 py-2"
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
            setPending(true)
            router.push('/transactions')
          }}
          className="self-start text-sm underline"
        >
          Clear filters
        </button>
      )}
    </form>
  )
}

export type { TransactionType }
