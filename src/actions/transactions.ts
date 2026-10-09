'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  createAccount,
  createCategory,
  createTransaction,
  deleteTransaction,
  updateTransaction,
  updateAccount,
  deleteAccount,
  archiveAccount,
  updateCategory,
  deleteCategory,
  createAdjustment,
  deleteAdjustment,
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

/**
 * Correcting an account.
 *
 * **The gap this closes is the one where a mistyped opening balance was permanent.**
 * Creating an account was the only account write the app had: no update, no delete,
 * no archive — so a number typed wrong on a brand-new account stayed wrong, with no
 * way out of the UI. The columns have always been ordinary updatable columns, so
 * this was missing code rather than a missing capability.
 *
 * `openingBalance` is **required** here, where it is optional on the create. That is
 * deliberate: an edit that omitted it would write `'0.00'` over a real balance,
 * because a patch is not a merge. Requiring the field means the form has to carry the
 * figure it is editing, which is also the only way the user can see what they are
 * about to overwrite.
 */
const updateAccountSchema = z.object({
  id: z.string().uuid('That account no longer exists'),
  name: z.string().trim().min(1, 'Name is required').max(80),
  kind: accountKindSchema,
  openingBalance: z
    .string()
    .trim()
    .regex(/^-?\d*\.?\d{0,2}$/, 'Enter a valid amount'),
})

export async function updateAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateAccountSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    kind: formData.get('kind'),
    openingBalance: formData.get('openingBalance'),
  })
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) }
  }

  try {
    await updateAccount({
      id: parsed.data.id,
      name: parsed.data.name,
      kind: parsed.data.kind,
      openingBalance: parsed.data.openingBalance,
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save the account' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/accounts')
  return { success: 'Account saved' }
}

/**
 * Delete or archive an account.
 *
 * `archive` is not a consolation prize — it is the only correct action for an
 * account with history, since deleting would either fail on the foreign key or take
 * the transactions with it. `deleteAccount` counts first and explains itself; this
 * action passes that message straight through.
 */
export async function deleteAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = uuidSchema.safeParse(formData.get('id'))
  if (!parsed.success) return { error: 'That account no longer exists.' }

  try {
    if (formData.get('archive') === 'true') {
      await archiveAccount({ id: parsed.data })
    } else {
      await deleteAccount({ id: parsed.data })
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not remove the account' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/accounts')
  return { success: formData.get('archive') === 'true' ? 'Account archived' : 'Account removed' }
}

const updateCategorySchema = z.object({
  id: z.string().uuid('That category no longer exists'),
  name: z.string().trim().min(1, 'Name is required').max(50),
  type: categoryTypeSchema,
})

/**
 * Rename a category.
 *
 * Transactions point at `category_id`, not at the name, so a rename carries every
 * past transaction with it and nothing is orphaned — which is why this is safe and
 * needs no warning about history.
 */
export async function updateCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateCategorySchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    type: formData.get('type'),
  })
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) }
  }

  try {
    await updateCategory({
      id: parsed.data.id,
      name: parsed.data.name,
      type: parsed.data.type,
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save the category' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/categories')
  return { success: 'Category saved' }
}

/**
 * Delete a category.
 *
 * Safe without a guard, because `category_id` is `on delete set null`: the
 * transactions survive as orphans and Reports already shows those as
 * "Uncategorised". The action says so rather than implying nothing is affected.
 */
export async function deleteCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = uuidSchema.safeParse(formData.get('id'))
  if (!parsed.success) return { error: 'That category no longer exists.' }

  try {
    await deleteCategory({ id: parsed.data })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not remove the category' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/categories')
  return { success: 'Category removed' }
}

/**
 * Record a balance correction.
 *
 * **Signed on purpose, and that is the whole interface.** The user is stating what
 * the balance *should* be different by, not what it should become — a correction
 * that took an absolute figure would have to guess a direction, and one that took
 * only a positive amount could not express a downward correction at all.
 *
 * `amount` accepts a leading `-` and nothing else loose: no thousands separators, no
 * currency symbol, at most two decimals. Anything more forgiving would be parsed by
 * `lib/money.ts` on the way in and by the database as a `numeric` on the way out,
 * and those two are exactly where ADR-004's rounding bugs live.
 */
const adjustmentSchema = z.object({
  accountId: z.string().uuid('That account no longer exists'),
  amount: z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d{1,2})?$/, 'Enter an amount, optionally negative'),
  reason: z.string().trim().max(200).optional(),
})

export async function createAdjustmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = adjustmentSchema.safeParse({
    accountId: formData.get('accountId'),
    amount: formData.get('amount'),
    reason: formData.get('reason') || undefined,
  })
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) }
  }

  // A zero correction is a no-op that would sit in the ledger saying nothing.
  if (Number(parsed.data.amount) === 0) {
    return { error: 'That would not change the balance.' }
  }

  try {
    await createAdjustment({
      accountId: parsed.data.accountId,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not record the correction',
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/accounts')
  return { success: 'Correction recorded' }
}

export async function deleteAdjustmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = uuidSchema.safeParse(formData.get('id'))
  if (!parsed.success) return { error: 'That correction no longer exists.' }

  try {
    await deleteAdjustment({ id: parsed.data })
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not remove the correction',
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/accounts')
  return { success: 'Correction removed' }
}
