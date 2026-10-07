'use client'

import { useActionState, useState } from 'react'
import { useWriteInvalidation } from '@/lib/client/useWriteInvalidation'
import { createTransactionAction, type ActionState } from '@/actions/transactions'
import type { Account, Category } from '@/lib/queries/reference'
import type { TransactionType } from '@/types/database'
import { Alert } from '@/components/ui/Alert'
import { SelectField, TextField } from '@/components/ui/Field'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { buttonClass } from '@/components/ui/button'

const TYPES = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
] as const satisfies readonly { value: TransactionType; label: string }[]

/**
 * Add-transaction form.
 *
 * The type selector drives which fields are required: a transfer needs a
 * destination account and no category, while income and expense need a category
 * and no destination. The same rules are enforced again on the server and again
 * by CHECK constraints in the database — this is the friendly first pass.
 *
 * Amount sits first and alone under the type switch, because it is the field
 * with no sensible default and the one a user reaches for first.
 */
export function TransactionForm({
  accounts,
  categories,
  today,
}: {
  accounts: Account[]
  categories: Category[]
  today: string
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createTransactionAction,
    {},
  )

  // A Server Action's revalidatePath cannot reach the browser's cache, so without
  // this the dashboard keeps showing the figure from before the write.
  useWriteInvalidation(state.success, 'transaction')
  const [type, setType] = useState<TransactionType>('expense')

  const incomeCategories = categories.filter((c) => c.type === 'income')
  const expenseCategories = categories.filter((c) => c.type === 'expense')
  const visibleCategories = type === 'income' ? incomeCategories : expenseCategories

  return (
    <form action={formAction} className="flex flex-col gap-4" id="add">
      <div>
        <h2 className="tk-section">Add transaction</h2>
        <p className="tk-caption mt-1">
          Recorded the moment you confirm it, dated when it happened.
        </p>
      </div>

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <SegmentedControl
        name="type"
        ariaLabel="Type"
        value={type}
        options={TYPES}
        onChange={setType}
      />

      <TextField
        name="amount"
        label="Amount"
        inputMode="decimal"
        placeholder="0.00"
        required
        error={state.fieldErrors?.amount}
        money
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="accountId" label="Account" required error={state.fieldErrors?.accountId}>
          <option value="">Select an account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>

        {type === 'transfer' ? (
          <SelectField
            name="counterpartyAccountId"
            label="To account"
            required
            error={state.fieldErrors?.counterpartyAccountId}
          >
            <option value="">Select a destination</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <SelectField
            name="categoryId"
            label="Category"
            required
            error={state.fieldErrors?.categoryId}
          >
            <option value="">Select a category</option>
            {visibleCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        )}

        <TextField
          name="occurredOn"
          label="Date"
          type="date"
          defaultValue={today}
          required
          error={state.fieldErrors?.occurredOn}
        />

        <TextField
          name="description"
          label="Description"
          placeholder="Optional"
          maxLength={500}
          className="sm:col-span-2"
        />
      </div>

      <button type="submit" disabled={pending} className={buttonClass('primary', { block: true })}>
        {pending ? 'Saving…' : 'Save transaction'}
      </button>
    </form>
  )
}
