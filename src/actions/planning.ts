'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { parseAmount, toNumericString } from '@/lib/money'
import {
  isoDateSchema,
  uuidSchema,
  fieldErrorsFrom,
  transactionTypeSchema,
} from '@/lib/validations'
import {
  createBudget,
  createRecurring,
  deleteBudget,
  deleteRecurring,
  postRecurringOccurrence,
} from '@/lib/queries/planning'

/**
 * Budget and recurring-transaction actions.
 *
 * Each re-derives the workspace from the session. None accept a workspace id or
 * a user id — that would make every one of them an IDOR.
 */

export interface ActionState {
  error?: string
  success?: string
  fieldErrors?: Record<string, string>
}

/**
 * Message shown to the user when a form action fails.
 *
 * A thrown Error from a form action becomes a 500 and an error page, which is a
 * terrible outcome for something as ordinary as deleting a row that was already
 * gone. These actions redirect back with the reason instead.
 */
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

const amountSchema = z
  .string()
  .trim()
  .min(1, 'Amount is required')
  .regex(/^\d*\.?\d{0,2}$/, 'Enter a valid amount with at most 2 decimal places')
  .refine((v) => Number(v) > 0, 'Amount must be greater than zero')

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export async function createBudgetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = formData.get('categoryId')
  const parsed = z
    .object({
      // Empty string means an overall spending cap rather than a category one.
      categoryId: z.union([z.literal(''), uuidSchema]).optional(),
      amount: amountSchema,
    })
    .safeParse({
      categoryId: raw === null ? '' : String(raw),
      amount: formData.get('amount'),
    })

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) }
  }

  try {
    let minor: number
    try {
      minor = parseAmount(parsed.data.amount)
    } catch {
      return { fieldErrors: { amount: 'Enter a valid amount' } }
    }

    await createBudget({
      categoryId:
        parsed.data.categoryId === undefined || parsed.data.categoryId === ''
          ? null
          : parsed.data.categoryId,
      amount: toNumericString(minor),
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not create the budget' }
  }

  revalidatePath('/budgets')
  return { success: 'Budget created' }
}

export async function deleteBudgetAction(formData: FormData): Promise<void> {
  const raw = formData.get('id')
  const parsed = uuidSchema.safeParse(raw)
  if (!parsed.success) {
    redirect(`/budgets?error=${encodeURIComponent('Invalid budget id.')}`)
  }

  try {
    await deleteBudget(parsed.data)
  } catch (error) {
    // redirect() is called outside the try so its control-flow throw is not
    // swallowed by the catch.
    redirect(
      `/budgets?error=${encodeURIComponent(errorMessage(error, 'Could not remove the budget.'))}`,
    )
  }

  revalidatePath('/budgets')
}

// ---------------------------------------------------------------------------
// Recurring transactions
// ---------------------------------------------------------------------------

const recurringSchema = z.object({
  type: transactionTypeSchema,
  amount: amountSchema,
  accountId: uuidSchema,
  categoryId: z.union([z.literal(''), uuidSchema]).optional(),
  counterpartyAccountId: z.union([z.literal(''), uuidSchema]).optional(),
  description: z.string().trim().max(500).optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  intervalCount: z.coerce.number().int().min(1).max(365),
  anchorDate: isoDateSchema,
  endsOn: z.union([z.literal(''), isoDateSchema]).optional(),
})

export async function createRecurringAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rawCat = String(formData.get('categoryId') ?? '')
  const rawCp = String(formData.get('counterpartyAccountId') ?? '')
  const rawEnds = String(formData.get('endsOn') ?? '')

  const parsed = recurringSchema.safeParse({
    type: formData.get('type'),
    amount: formData.get('amount'),
    accountId: formData.get('accountId'),
    categoryId: rawCat,
    counterpartyAccountId: rawCp,
    description: String(formData.get('description') ?? '') || undefined,
    frequency: formData.get('frequency'),
    intervalCount: formData.get('intervalCount') || 1,
    anchorDate: formData.get('anchorDate'),
    endsOn: rawEnds,
  })

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) }
  }

  const input = parsed.data
  const categoryId = input.categoryId === '' ? undefined : input.categoryId
  const counterparty = input.counterpartyAccountId === '' ? undefined : input.counterpartyAccountId

  // Same shape rules as a transaction, mirrored for a useful error message.
  // The database CHECK is still the authority.
  if (input.type === 'transfer' && !counterparty) {
    return { fieldErrors: { counterpartyAccountId: 'A transfer needs a destination account' } }
  }
  if (input.type !== 'transfer' && !categoryId) {
    return { fieldErrors: { categoryId: 'Income and expense need a category' } }
  }

  try {
    await createRecurring({
      type: input.type,
      amount: input.amount,
      accountId: input.accountId,
      categoryId,
      counterpartyAccountId: counterparty,
      description: input.description,
      frequency: input.frequency,
      intervalCount: input.intervalCount,
      anchorDate: input.anchorDate,
      endsOn: input.endsOn === '' ? null : input.endsOn,
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not create the rule' }
  }

  revalidatePath('/recurring')
  return { success: 'Rule created' }
}

/**
 * Post a due occurrence.
 *
 * The occurrence date is validated as a real date and the rule id as a UUID,
 * but the duplicate guard itself lives in the query layer and in the database,
 * not here.
 */
export async function postOccurrenceAction(formData: FormData): Promise<void> {
  const id = uuidSchema.safeParse(formData.get('id'))
  const date = isoDateSchema.safeParse(formData.get('occurrenceDate'))

  if (!id.success || !date.success) {
    redirect(`/recurring?error=${encodeURIComponent('That occurrence is not valid.')}`)
  }

  try {
    await postRecurringOccurrence(id.data, date.data)
  } catch (error) {
    // Includes the two integrity guards: an already-posted occurrence, and a
    // date that is not a real occurrence of this rule.
    redirect(
      `/recurring?error=${encodeURIComponent(errorMessage(error, 'Could not post the transaction.'))}`,
    )
  }

  revalidatePath('/recurring')
  revalidatePath('/dashboard')
  revalidatePath('/transactions')
}

export async function deleteRecurringAction(formData: FormData): Promise<void> {
  const parsed = uuidSchema.safeParse(formData.get('id'))
  if (!parsed.success) {
    redirect(`/recurring?error=${encodeURIComponent('Invalid rule id.')}`)
  }

  try {
    await deleteRecurring(parsed.data)
  } catch (error) {
    redirect(
      `/recurring?error=${encodeURIComponent(errorMessage(error, 'Could not delete the rule.'))}`,
    )
  }

  revalidatePath('/recurring')
}
