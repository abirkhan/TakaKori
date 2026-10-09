'use client'

import { useState } from 'react'
import { useWriteInvalidation } from '@/lib/client/useWriteInvalidation'
import { createRecurringAction, type ActionState } from '@/actions/planning'
import type { Account, Category } from '@/lib/queries/reference'
import { Alert } from '@/components/ui/Alert'
import { SelectField, TextField } from '@/components/ui/Field'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { buttonClass } from '@/components/ui/button'
import { useWriteAction } from '@/lib/client/useWriteAction'

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

/**
 * Add-recurring-rule form.
 *
 * Six fields is the most this form will ever have, so it is the one form that
 * gets a two-row grid rather than a stack. `Ends on` is optional and last in its
 * row, because a rule without an end date is the common case and an optional
 * field should never be the thing that draws the eye.
 */
export function RecurringForm({
  accounts,
  categories,
  today,
}: {
  accounts: Account[]
  categories: Category[]
  today: string
}) {
  const [state, formAction, pending, attempt] = useWriteAction<ActionState>(
    createRecurringAction,
    {},
  )

  // A Server Action's revalidatePath cannot reach the browser's cache, so without
  // this the dashboard keeps showing the figure from before the write.
  useWriteInvalidation(state.success, 'recurring', attempt)
  const [type, setType] = useState<'income' | 'expense'>('expense')

  const visibleCategories = categories.filter((c) => c.type === type)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h2 className="tk-section">Add a recurring rule</h2>
        <p className="tk-caption mt-1">Predicts the next date. Never posts on its own.</p>
      </div>

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <SegmentedControl
        name="type"
        ariaLabel="Type"
        value={type}
        onChange={setType}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TextField
          name="amount"
          label="Amount"
          inputMode="decimal"
          placeholder="0.00"
          required
          className="tabular-nums"
        />

        <SelectField name="accountId" label="Account" required>
          <option value="">Select</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>

        <SelectField name="categoryId" label="Category" required>
          <option value="">Select</option>
          {visibleCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>

        <TextField name="description" label="Description" maxLength={500} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField name="frequency" label="Repeats" defaultValue="monthly">
          {FREQUENCIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </SelectField>

        <SelectField name="intervalCount" label="Interval" defaultValue="1">
          {INTERVALS.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </SelectField>

        <TextField name="anchorDate" label="First due" type="date" defaultValue={today} required />

        <TextField name="endsOn" label="Ends on (optional)" type="date" />
      </div>

      <p className="tk-caption">
        A monthly rule anchored on the 31st falls on the last day of shorter months, so a 31st
        payment lands on 28 or 29 February rather than disappearing.
      </p>

      <button type="submit" disabled={pending} className={buttonClass('soft')}>
        {pending ? 'Saving…' : 'Add rule'}
      </button>
    </form>
  )
}