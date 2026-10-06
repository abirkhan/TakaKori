'use client'

import { useActionState, useEffect, useId, useState } from 'react'
import { updateTransactionAction, type ActionState } from '@/actions/transactions'
import type { ExportableTransaction } from '@/lib/csv'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'

interface EditableTransaction extends Pick<
  ExportableTransaction,
  'id' | 'type' | 'amount' | 'description' | 'occurred_on'
> {
  /** The row's own title, so the sheet says *which* record is being edited. */
  title: string
}

/**
 * Edit sheet.
 *
 * Only amount, date and description are editable. Changing the account or
 * category is deliberately not offered: it interacts with the cross-workspace
 * trigger and the category-type rule, and a partial UI for it would be more
 * confusing than useful. Those are changed by delete + recreate, which keeps the
 * ledger honest.
 *
 * Was a `<details>` disclosure inside the row. Two reasons it is a sheet now: the
 * disclosure put two more tap targets on every row of a fifty-row list, and its
 * inline form reflowed the row it belonged to, so opening it moved everything
 * below it.
 *
 * The fields are controlled for the same reason as the add sheet's — React resets
 * an uncontrolled form when its action resolves, so a rejected edit would blank
 * every field instead of showing the user what was wrong with the one they
 * changed.
 */
export function EditTransactionSheet({
  transaction,
  open,
  onClose,
}: {
  transaction: EditableTransaction
  open: boolean
  onClose: () => void
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateTransactionAction,
    {},
  )
  // Seeded from the record once, at mount. `TransactionList` mounts this sheet
  // only while it is open, so every open is a fresh mount and an initializer is
  // enough. An effect that re-seeded on `open` would be setState-in-effect —
  // banned by the react-hooks lint rule — doing what a key prop does properly.
  const [draft, setDraft] = useState(() => ({
    amount: String(transaction.amount),
    occurredOn: transaction.occurred_on,
    description: transaction.description ?? '',
  }))
  const formId = useId()

  useEffect(() => {
    if (state.success && open) onClose()
  }, [state.success, open, onClose])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit transaction"
      description={transaction.title}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass('quiet')}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={pending} className={buttonClass('primary')}>
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <form id={formId} action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={transaction.id} />

        {state.error && <Alert tone="error">{state.error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="amount"
            label="Amount"
            inputMode="decimal"
            required
            value={draft.amount}
            onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
            error={state.fieldErrors?.amount}
            money
          />

          <TextField
            name="occurredOn"
            label="Date"
            type="date"
            required
            value={draft.occurredOn}
            onChange={(e) => setDraft((d) => ({ ...d, occurredOn: e.target.value }))}
            error={state.fieldErrors?.occurredOn}
          />

          <TextField
            name="description"
            label="Description"
            maxLength={500}
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            className="sm:col-span-2"
          />
        </div>

        <p className="tk-caption">
          Account and category are not editable. To change those, delete this and add it again — it
          keeps the ledger honest about what happened.
        </p>
      </form>
    </Modal>
  )
}
