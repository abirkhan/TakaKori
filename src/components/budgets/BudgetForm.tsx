'use client'

import { useActionState } from 'react'
import { createBudgetAction, type ActionState } from '@/actions/planning'
import type { Category } from '@/lib/queries/reference'

export function BudgetForm({ categories }: { categories: Category[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createBudgetAction, {})

  const expenseCategories = categories.filter((c) => c.type === 'expense')

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Set a budget</h2>

      {state.error && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span>Applies to</span>
          <select name="categoryId" className="rounded border border-neutral-300 px-3 py-2">
            <option value="">All spending</option>
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span>Monthly limit</span>
          <input
            type="text"
            inputMode="decimal"
            name="amount"
            placeholder="5000.00"
            required
            className="rounded border border-neutral-300 px-3 py-2 tabular-nums"
          />
          {state.fieldErrors?.amount && (
            <span className="text-xs text-red-600">{state.fieldErrors.amount}</span>
          )}
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Add budget'}
        </button>
      </div>
    </form>
  )
}
