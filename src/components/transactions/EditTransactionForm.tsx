'use client'

import { useActionState } from 'react'
import { updateTransactionAction, type ActionState } from '@/actions/transactions'
import type { ExportableTransaction } from '@/lib/csv'

/**
 * Inline edit for a transaction's mutable fields.
 *
 * Only amount, date, type and description are editable here. Changing the
 * account or category is deliberately not offered: it interacts with the
 * cross-workspace trigger and the category-type rule, and a partial UI for it
 * would be more confusing than useful. Those are changed by delete + recreate,
 * which keeps the ledger honest.
 */
export function EditTransactionForm({
  transaction,
}: {
  transaction: Pick<ExportableTransaction, 'id' | 'type' | 'amount' | 'description' | 'occurred_on'>
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateTransactionAction,
    {},
  )

  return (
    <form action={formAction} className="flex flex-col gap-2 text-sm">
      <input type="hidden" name="id" value={transaction.id} />

      {state.error && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Amount</span>
          <input
            type="text"
            inputMode="decimal"
            name="amount"
            defaultValue={String(transaction.amount)}
            className="w-28 rounded border border-neutral-300 px-2 py-1 tabular-nums"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Date</span>
          <input
            type="date"
            name="occurredOn"
            defaultValue={transaction.occurred_on}
            className="rounded border border-neutral-300 px-2 py-1"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Description</span>
          <input
            type="text"
            name="description"
            maxLength={500}
            defaultValue={transaction.description ?? ''}
            className="w-44 rounded border border-neutral-300 px-2 py-1"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-50 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>

      {(state.fieldErrors?.amount || state.fieldErrors?.occurredOn) && (
        <div className="flex flex-col gap-0.5 text-xs text-red-600">
          {state.fieldErrors.amount && <span>{state.fieldErrors.amount}</span>}
          {state.fieldErrors.occurredOn && <span>{state.fieldErrors.occurredOn}</span>}
        </div>
      )}
    </form>
  )
}
