'use client'

import { useActionState } from 'react'
import { createCategoryAction, type ActionState } from '@/actions/transactions'

export function CategoryForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createCategoryAction,
    {},
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Add category</h2>

      {state.error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span>Name</span>
          <input
            type="text"
            name="name"
            maxLength={50}
            required
            className="rounded border border-neutral-300 px-3 py-2"
          />
          {state.fieldErrors?.name && (
            <span className="text-xs text-red-600">{state.fieldErrors.name}</span>
          )}
        </label>

        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span>Type</span>
          <select name="type" className="rounded border border-neutral-300 px-3 py-2">
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Add category'}
        </button>
      </div>
    </form>
  )
}