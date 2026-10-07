'use client'

import { useActionState, useEffect, useId, useState } from 'react'
import { useWriteInvalidation } from '@/lib/client/useWriteInvalidation'
import { createTransactionAction, type ActionState } from '@/actions/transactions'
import type { Account, Category } from '@/lib/queries/reference'
import type { TransactionType } from '@/types/database'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { SelectField, TextField } from '@/components/ui/Field'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { buttonClass } from '@/components/ui/button'

const TYPES = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
] as const satisfies readonly { value: TransactionType; label: string }[]

interface Draft {
  amount: string
  accountId: string
  counterpartyAccountId: string
  categoryId: string
  occurredOn: string
  description: string
}

function blank(today: string): Draft {
  return {
    amount: '',
    accountId: '',
    counterpartyAccountId: '',
    categoryId: '',
    occurredOn: today,
    description: '',
  }
}

/**
 * The form's fields, mounted only while the sheet is open.
 *
 * **The fields are controlled, and that is not incidental.** React resets an
 * uncontrolled `<form>` once its action resolves — including when the action
 * *fails*. An earlier version left them uncontrolled, so a server validation
 * failure wiped every field the user had filled in and left them retyping the
 * whole form beside the error message explaining what they got wrong.
 *
 * **Holding the draft in this component rather than its parent is what makes the
 * sheet reset.** Remounting on open discards the draft for free, so there is no
 * reset effect — and no `setState` inside one, which React's lint rule exists to
 * prevent because an effect that writes state re-renders on a schedule the author
 * did not choose. Open the sheet, type, cancel, open again: it is empty, on the
 * first frame, with no stale amount flashing into view.
 *
 * The save button lives in the sheet's pinned footer rather than at the end of
 * the form. It is a `<button form="…">` pointing at this form by id, because the
 * HTML `form` attribute is what lets one form span two elements — two separate
 * `<form>`s would submit two different field sets.
 *
 * The type selector drives which fields are required: a transfer needs a
 * destination account and no category, while income and expense need a category
 * and no destination. The same rules are enforced again on the server and again
 * by CHECK constraints in the database — this is the friendly first pass.
 */
function TransactionFields({
  formId,
  action,
  accounts,
  categories,
  today,
  state,
}: {
  formId: string
  action: (formData: FormData) => void
  accounts: Account[]
  categories: Category[]
  today: string
  state: ActionState
}) {
  const [type, setType] = useState<TransactionType>('expense')
  const [draft, setDraft] = useState<Draft>(() => blank(today))

  const set = (key: keyof Draft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }))

  const incomeCategories = categories.filter((c) => c.type === 'income')
  const expenseCategories = categories.filter((c) => c.type === 'expense')
  const visibleCategories = type === 'income' ? incomeCategories : expenseCategories

  return (
    <form id={formId} action={action} className="flex flex-col gap-4">
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
        value={draft.amount}
        onChange={(e) => set('amount')(e.target.value)}
        error={state.fieldErrors?.amount}
        money
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="accountId"
          label="Account"
          required
          value={draft.accountId}
          onChange={(e) => set('accountId')(e.target.value)}
          error={state.fieldErrors?.accountId}
        >
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
            value={draft.counterpartyAccountId}
            onChange={(e) => set('counterpartyAccountId')(e.target.value)}
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
            value={draft.categoryId}
            onChange={(e) => set('categoryId')(e.target.value)}
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
          required
          value={draft.occurredOn}
          onChange={(e) => set('occurredOn')(e.target.value)}
          error={state.fieldErrors?.occurredOn}
        />

        <TextField
          name="description"
          label="Description"
          placeholder="Optional"
          maxLength={500}
          value={draft.description}
          onChange={(e) => set('description')(e.target.value)}
          className="sm:col-span-2"
        />
      </div>
    </form>
  )
}

/**
 * Add-transaction sheet.
 *
 * A modal rather than an inline form for one reason above all: the Transactions
 * screen is the second tab, and a user tapping it to *see* their spending was
 * previously met by a six-field form occupying the whole first screenful. The
 * list is the screen; the form is an interruption of it, so it interrupts.
 *
 * `useActionState` lives here rather than in `TransactionFields` because the
 * pinned footer's submit button has to dispatch the same action as the form, and
 * the state has to survive the fields' unmount.
 */
export function AddTransactionSheet({
  accounts,
  categories,
  today,
  open,
  onClose,
}: {
  accounts: Account[]
  categories: Category[]
  today: string
  open: boolean
  onClose: () => void
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createTransactionAction,
    {},
  )
  const formId = useId()

  // Close only once the action has actually succeeded, so a validation failure
  // leaves the user's input on screen next to the message explaining the error.
  // Calling the prop rather than a local wrapper keeps this free of setState.
  useEffect(() => {
    if (state.success && open) onClose()
  }, [state.success, open, onClose])

  // A Server Action's `revalidatePath` cannot reach the browser's cache, so the
  // dashboard would keep showing the balance from before this write. See
  // `useWriteInvalidation` for why this exists at all.
  useWriteInvalidation(state.success, 'transaction')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add transaction"
      description="Dated when it happened, recorded now."
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass('quiet')}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={pending} className={buttonClass('primary')}>
            {pending ? 'Saving…' : 'Save transaction'}
          </button>
        </>
      }
    >
      {open && (
        <TransactionFields
          formId={formId}
          action={formAction}
          accounts={accounts}
          categories={categories}
          today={today}
          state={state}
        />
      )}
    </Modal>
  )
}
