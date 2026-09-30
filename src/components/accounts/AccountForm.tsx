'use client'

import { useActionState } from 'react'
import { createAccountAction, type ActionState } from '@/actions/transactions'

const KINDS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank account' },
  { value: 'mobile', label: 'Mobile wallet (bKash, Nagad)' },
  { value: 'credit_card', label: 'Credit card' },
] as const

export function AccountForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createAccountAction,
    {},
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Add account</h2>

      {state.error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-4 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span>Name</span>
          <input
            type="text"
            name="name"
            maxLength={80}
            required
            placeholder="Cash, Bank, bKash…"
            className="rounded border border-neutral-300 px-3 py-2"
          />
          {state.fieldErrors?.name && (
            <span className="text-xs text-red-600">{state.fieldErrors.name}</span>
          )}
        </label>

        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span>Type</span>
          <select name="kind" className="rounded border border-neutral-300 px-3 py-2">
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span>Opening balance</span>
          <input
            type="text"
            inputMode="decimal"
            name="openingBalance"
            placeholder="0.00"
            className="rounded border border-neutral-300 px-3 py-2 tabular-nums"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Add account'}
      </button>
    </form>
  )
}