'use client'

import { useActionState, useState } from 'react'
import { createRecurringAction, type ActionState } from '@/actions/planning'
import type { Account, Category } from '@/lib/queries/reference'

// Monthly first, because it is the common case: rent, salary, a phone bill.
// The select's first entry is its default, so ordering here is behaviour.
const FREQUENCIES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'yearly', label: 'Yearly' },
] as const

const INTERVALS = [
  { value: '1', label: 'Every' },
  { value: '2', label: 'Every 2nd' },
  { value: '3', label: 'Every 3rd' },
] as const

export function RecurringForm({
  accounts,
  categories,
  today,
}: {
  accounts: Account[]
  categories: Category[]
  today: string
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createRecurringAction,
    {},
  )
  const [type, setType] = useState<'income' | 'expense'>('expense')

  const visibleCategories = categories.filter((c) => c.type === type)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Add a recurring rule</h2>

      {state.error && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}

      <fieldset className="flex gap-2">
        <legend className="sr-only">Type</legend>
        {(['income', 'expense'] as const).map((value) => (
          <label
            key={value}
            className={`cursor-pointer rounded border px-3 py-1.5 text-sm capitalize ${
              type === value ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
            }`}
          >
            <input
              type="radio"
              name="type"
              value={value}
              checked={type === value}
              onChange={() => setType(value)}
              className="sr-only"
            />
            {value}
          </label>
        ))}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span>Amount</span>
          <input
            type="text"
            inputMode="decimal"
            name="amount"
            placeholder="0.00"
            required
            className="rounded border border-neutral-300 px-3 py-2 tabular-nums"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Account</span>
          <select name="accountId" required className="rounded border border-neutral-300 px-3 py-2">
            <option value="">Select</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Category</span>
          <select
            name="categoryId"
            required
            className="rounded border border-neutral-300 px-3 py-2"
          >
            <option value="">Select</option>
            {visibleCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Description</span>
          <input
            type="text"
            name="description"
            maxLength={500}
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span>Repeats</span>
          <select name="frequency" className="rounded border border-neutral-300 px-3 py-2">
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Interval</span>
          <select name="intervalCount" className="rounded border border-neutral-300 px-3 py-2">
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>First due</span>
          <input
            type="date"
            name="anchorDate"
            defaultValue={today}
            required
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Ends on (optional)</span>
          <input
            type="date"
            name="endsOn"
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
      </div>

      <p className="text-xs text-neutral-500">
        A monthly rule anchored on the 31st falls on the last day of shorter months, so a 31st
        payment lands on 28 or 29 February rather than disappearing.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Add rule'}
      </button>
    </form>
  )
}
