'use client'

import { useActionState } from 'react'
import { createAccountAction, type ActionState } from '@/actions/transactions'
import { Alert } from '@/components/ui/Alert'
import { SelectField, TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'

const KINDS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank account' },
  { value: 'mobile', label: 'Mobile wallet (bKash, Nagad)' },
  { value: 'credit_card', label: 'Credit card' },
] as const

/**
 * Add-account form.
 *
 * Three fields in one row on a desktop, stacked on a phone. Opening balance is
 * optional and defaults to zero because most people are adding an account that
 * already exists in the world, not opening a new one.
 */
export function AccountForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createAccountAction,
    {},
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h2 className="tk-section">Add account</h2>
        <p className="tk-caption mt-1">One row per place you can hold or spend money.</p>
      </div>

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          name="name"
          label="Name"
          maxLength={80}
          required
          placeholder="Cash, Bank, bKash…"
          error={state.fieldErrors?.name}
        />

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
        />
      </div>

      <button type="submit" disabled={pending} className={buttonClass('soft')}>
        {pending ? 'Saving…' : 'Add account'}
      </button>
    </form>
  )
}
