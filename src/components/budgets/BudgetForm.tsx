'use client'

import { useWriteInvalidation } from '@/lib/client/useWriteInvalidation'
import { createBudgetAction, type ActionState } from '@/actions/planning'
import type { Category } from '@/lib/queries/reference'
import { Alert } from '@/components/ui/Alert'
import { SelectField, TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'
import { useWriteAction } from '@/lib/client/useWriteAction'

export function BudgetForm({ categories }: { categories: Category[] }) {
  const [state, formAction, pending] = useWriteAction<ActionState>(createBudgetAction, {}, { queueKind: 'budget.create' })

  // A Server Action's revalidatePath cannot reach the browser's cache, so without
  // this the dashboard keeps showing the figure from before the write.
  useWriteInvalidation(state.success, 'budget')

  const expenseCategories = categories.filter((c) => c.type === 'expense')

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h2 className="tk-section">Set a budget</h2>
        <p className="tk-caption mt-1">One limit for all spending, or one per category.</p>
      </div>

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <SelectField name="categoryId" label="Applies to" defaultValue="">
          <option value="">All spending</option>
          {expenseCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>

        <TextField
          name="amount"
          label="Monthly limit"
          inputMode="decimal"
          placeholder="5,000.00"
          required
          error={state.fieldErrors?.amount}
          className="tabular-nums"
        />

        <button type="submit" disabled={pending} className={buttonClass('soft')}>
          {pending ? 'Saving…' : 'Add budget'}
        </button>
      </div>
    </form>
  )
}