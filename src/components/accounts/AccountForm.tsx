'use client'

import { useEffect, useId, useState } from 'react'
import { useWriteInvalidation } from '@/lib/client/useWriteInvalidation'
import { createAccountAction, type ActionState } from '@/actions/transactions'
import { Modal } from '@/components/ui/Modal'
import { useUrlSheet } from '@/components/ui/useUrlSheet'
import { Alert } from '@/components/ui/Alert'
import { SelectField, TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'
import { useWriteAction } from '@/lib/client/useWriteAction'

const KINDS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank account' },
  { value: 'mobile', label: 'Mobile wallet (bKash, Nagad)' },
  { value: 'credit_card', label: 'Credit card' },
] as const

/** The fields, mounted only while the sheet is open. See `TransactionFields`. */
function AccountFields({
  formId,
  action,
  state,
}: {
  formId: string
  action: (formData: FormData) => void
  state: ActionState
}) {
  const [draft, setDraft] = useState({ name: '', openingBalance: '' })

  return (
    <form id={formId} action={action} className="flex flex-col gap-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <TextField
        name="name"
        label="Name"
        maxLength={80}
        required
        placeholder="Cash, Bank, bKash…"
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        error={state.fieldErrors?.name}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="kind" label="Type" defaultValue="cash">
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </SelectField>

        <TextField
          name="openingBalance"
          label="Opening balance"
          inputMode="decimal"
          placeholder="0.00"
          className="tabular-nums"
          value={draft.openingBalance}
          onChange={(e) => setDraft((d) => ({ ...d, openingBalance: e.target.value }))}
        />
      </div>
    </form>
  )
}

/**
 * Add-account sheet.
 *
 * A sheet for the same reason the transaction form is one: `/accounts` is a tab,
 * and a form sitting in the middle of it made the tab promise three things at
 * once — balances, a create form, and navigation to every other settings screen.
 * With the form out of the way the screen is honestly "your accounts", which is
 * what the tab label claims.
 *
 * Opening balance is optional and defaults to zero, because most people are
 * adding an account that already exists rather than opening a new one.
 */
export function AccountForm() {
  const [state, formAction, pending] = useWriteAction<ActionState>(
    createAccountAction,    {}, { queueKind: 'account.create' },
  )

  // A Server Action's revalidatePath cannot reach the browser's cache, so without
  // this the dashboard keeps showing the figure from before the write.
  useWriteInvalidation(state.success, 'account')
  const { open, close } = useUrlSheet('account')
  const formId = useId()

  useEffect(() => {
    if (state.success && open) close()
  }, [state.success, open, close])

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add account"
      description="One row per place you can hold or spend money."
      footer={
        <>
          <button type="button" onClick={close} className={buttonClass('quiet')}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={pending} className={buttonClass('primary')}>
            {pending ? 'Saving…' : 'Add account'}
          </button>
        </>
      }
    >
      {open && <AccountFields formId={formId} action={formAction} state={state} />}
    </Modal>
  )
}