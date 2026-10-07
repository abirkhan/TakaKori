'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  createAccount,
  createCategory,
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from '@/lib/queries/server'
import {
  accountKindSchema,
  categoryTypeSchema,
  createTransactionSchema,
  updateTransactionSchema,
  uuidSchema,
  fieldErrorsFrom,
} from '@/lib/validations'

/**
 * Transaction and reference-data Server Actions.
 *
 * Every action re-derives the caller's workspace from the session. None of them
 * accept a workspace id, and none accept a user id. The client is never trusted
 * to say who it is.
 */

export interface ActionState {
  error?: string
  success?: string
  fieldErrors?: Record<string, string>
}

/**
 * Validate, then persist.
 *
 * The Zod schema mirrors the database CHECK constraints so the user gets a
 * readable message; the database remains the authority. A Postgres error is
 * mapped to something safe rather than shown raw.
 */
export async function createTransactionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = {
    type: formData.get('type'),
    amount: formData.get('amount'),
    accountId: formData.get('accountId'),
    counterpartyAccountId: formData.get('counterpartyAccountId') || undefined,
    categoryId: formData.get('categoryId') || undefined,
    description: formData.get('description') || undefined,
    occurredOn: formData.get('occurredOn'),
  }

  const parsed = createTransactionSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFrom(parsed.error),
    }
  }

  const input = parsed.data

  try {
    await createTransaction({
      type: input.type,
      amount: input.amount,
      accountId: input.accountId,
      categoryId: input.categoryId,
      counterpartyAccountId: input.counterpartyAccountId,
      description: input.description,
      occurredOn: input.occurredOn,
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save the transaction' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/transactions')
  return { success: 'Transaction saved' }
}

export async function updateTransactionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = uuidSchema.safeParse(formData.get('id'))
  if (!id.success) return { error: 'Invalid transaction id' }

  const parsed = updateTransactionSchema.safeParse({
    id: id.data,
    type: formData.get('type') || undefined,
    amount: formData.get('amount') || undefined,
    occurredOn: formData.get('occurredOn') || undefined,
    description: formData.get('description') ?? undefined,
  })
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFrom(parsed.error),
    }
  }

  try {
    await updateTransaction(id.data, parsed.data)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not update the transaction' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/transactions')
  return { success: 'Transaction updated' }
}

/**
 * Delete a transaction.
 *
 * **Returns a result instead of redirecting.** ADR-020 said redirect with
 * `?error=` rather than throw, because a thrown Error from a form action becomes
 * a 500 and an error page, which is a poor outcome for deleting a row that was
 * already gone. The *reason* for ADR-020 holds; the mechanism does not survive
 * the client-data move.
 *
 * A redirect is a server→browser navigation. Once the cache lives in the browser,
 * it has nothing to invalidate, so a delete would write its row, revalidate
 * paths the browser will never re-fetch, and leave the dashboard showing the
 * number from before — the failure ADR-012 describes. Returning `{ success }` is
 * what lets `useWriteInvalidation` clear the cache at the moment of the write.
 *
 * ADR-020's other half is kept: this still never throws, and the error text is
 * still a readable sentence rather than Postgres text.
 */
export async function deleteTransactionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = uuidSchema.safeParse(formData.get('id'))
  if (!parsed.success) {
    return { error: 'Invalid transaction id.' }
  }

  try {
    await deleteTransaction(parsed.data)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not delete the transaction.',
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/transactions')
  return { success: 'Transaction deleted' }
}

const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  kind: accountKindSchema,
  openingBalance: z
    .string()
    .trim()
    .regex(/^-?\d*\.?\d{0,2}$/, 'Enter a valid amount')
    .optional(),
})

export async function createAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createAccountSchema.safeParse({
    name: formData.get('name'),
    kind: formData.get('kind'),
    openingBalance: formData.get('openingBalance') || undefined,
  })
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) }
  }

  try {
    await createAccount({
      name: parsed.data.name,
      kind: parsed.data.kind,
      openingBalance: parsed.data.openingBalance,
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not create the account' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/accounts')
  return { success: 'Account created' }
}

const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50),
  type: categoryTypeSchema,
})

export async function createCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createCategorySchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type'),
  })
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) }
  }

  try {
    await createCategory({ name: parsed.data.name, type: parsed.data.type })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not create the category' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/categories')
  return { success: 'Category created' }
}
