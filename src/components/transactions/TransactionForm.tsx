'use client'

import { useActionState, useState } from 'react'
import { createTransactionAction, type ActionState } from '@/actions/transactions'
import type { Account, Category } from '@/lib/queries/reference'
import type { DateRange } from '@/lib/dates'

/**
 * Add-transaction form.
 *
 * The type selector drives which fields are required: a transfer needs a
 * destination account and no category, while income and expense need a category
 * and no destination. The same rules are enforced again on the server and again
 * by CHECK constraints in the database — this is the friendly first pass.
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
  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense')

  const incomeCategories = categories.filter((c) => c.type === 'income')
  const expenseCategories = categories.filter((c) => c.type === 'expense')
  const visibleCategories = type === 'income' ? incomeCategories : expenseCategories

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Add transaction</h2>

      {state.error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <fieldset className="flex gap-2">
        <legend className="sr-only">Type</legend>
        {(['income', 'expense', 'transfer'] as const).map((value) => (
          <label
            key={value}
            className={`cursor-pointer rounded border px-3 py-1.5 text-sm capitalize ${
              type === value
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-300'
            }`}
          >
            <input
              type="radio"
              name="type"
              value={value}
              checked={type === value}
              onChange={() => setType(value)}
              className="sr-only"
            />
            {value}
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span>Amount</span>
        <input
          type="text"
          inputMode="decimal"
          name="amount"
          placeholder="0.00"
          required
          className="rounded border border-neutral-300 px-3 py-2 tabular-nums"
        />
        {state.fieldErrors?.amount && (
          <span className="text-xs text-red-600">{state.fieldErrors.amount}</span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span>Account</span>
        <select
          name="accountId"
          required
          className="rounded border border-neutral-300 px-3 py-2"
        >
          <option value="">Select an account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {state.fieldErrors?.accountId && (
          <span className="text-xs text-red-600">{state.fieldErrors.accountId}</span>
        )}
      </label>

      {type === 'transfer' ? (
        <label className="flex flex-col gap-1 text-sm">
          <span>To account</span>
          <select
            name="counterpartyAccountId"
            required
            className="rounded border border-neutral-300 px-3 py-2"
          >
            <option value="">Select a destination</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {state.fieldErrors?.counterpartyAccountId && (
            <span className="text-xs text-red-600">
              {state.fieldErrors.counterpartyAccountId}
            </span>
          )}
        </label>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          <span>Category</span>
          <select
            name="categoryId"
            required
            className="rounded border border-neutral-300 px-3 py-2"
          >
            <option value="">Select a category</option>
            {visibleCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {state.fieldErrors?.categoryId && (
            <span className="text-xs text-red-600">{state.fieldErrors.categoryId}</span>
          )}
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span>Date</span>
        <input
          type="date"
          name="occurredOn"
          defaultValue={today}
          required
          className="rounded border border-neutral-300 px-3 py-2"
        />
        {state.fieldErrors?.occurredOn && (
          <span className="text-xs text-red-600">{state.fieldErrors.occurredOn}</span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span>Description (optional)</span>
        <input
          type="text"
          name="description"
          maxLength={500}
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save transaction'}
      </button>
    </form>
  )
}

export type { DateRange }