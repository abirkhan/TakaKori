'use client'

import { useState } from 'react'
import { useWriteInvalidation } from '@/lib/client/useWriteInvalidation'
import { createCategoryAction, type ActionState } from '@/actions/transactions'
import { Alert } from '@/components/ui/Alert'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'
import { useWriteAction } from '@/lib/client/useWriteAction'

export function CategoryForm() {
  const [state, formAction, pending] = useWriteAction<ActionState>(
    createCategoryAction,
    {},
  )

  // A Server Action's revalidatePath cannot reach the browser's cache, so without
  // this the dashboard keeps showing the figure from before the write.
  useWriteInvalidation(state.success, 'category')
  const [type, setType] = useState<'expense' | 'income'>('expense')

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h2 className="tk-section">Add category</h2>
        <p className="tk-caption mt-1">Categories decide how your spending is grouped.</p>
      </div>

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
        <TextField
          name="name"
          label="Name"
          maxLength={50}
          required
          placeholder="Groceries, Rent, Transport…"
          error={state.fieldErrors?.name}
        />

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

        <button type="submit" disabled={pending} className={buttonClass('soft')}>
          {pending ? 'Saving…' : 'Add'}
        </button>
      </div>
    </form>
  )
}