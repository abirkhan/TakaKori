'use client'

import { useActionState } from 'react'
import { updateTransactionAction, type ActionState } from '@/actions/transactions'
import type { ExportableTransaction } from '@/lib/csv'
import { Alert } from '@/components/ui/Alert'
import { TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'

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
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={transaction.id} />

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-[8rem_10rem_1fr_auto] sm:items-end">
        <TextField
          name="amount"
          label="Amount"
          inputMode="decimal"
          defaultValue={String(transaction.amount)}
          className="tabular-nums"
          error={state.fieldErrors?.amount}
        />

        <TextField
          name="occurredOn"
          label="Date"
          type="date"
          defaultValue={transaction.occurred_on}
          error={state.fieldErrors?.occurredOn}
        />

        <TextField
          name="description"
          label="Description"
          maxLength={500}
          defaultValue={transaction.description ?? ''}
        />

        <button type="submit" disabled={pending} className={buttonClass('soft', { size: 'sm' })}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
