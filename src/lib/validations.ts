import { z } from 'zod'

/**
 * Validation schemas.
 *
 * Every Server Action parses its input with these. Validation on the client is
 * a UX affordance only; a client can always be bypassed.
 *
 * Amount is validated as a *string* here, then converted by parseAmount(). It
 * is never accepted as a JS number, because "500.10" parsed by Number() is
 * already a float approximation before we ever store it.
 */

export const transactionTypeSchema = z.enum(['income', 'expense', 'transfer'])

export const accountKindSchema = z.enum(['cash', 'bank', 'mobile', 'credit_card'])

export const categoryTypeSchema = z.enum(['income', 'expense'])

/** YYYY-MM-DD. Rejects other formats rather than guessing the user's intent. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine((value) => isRealCalendarDate(value), 'Date is not a real calendar date')

/**
 * True only if the string is a date that genuinely exists.
 *
 * `Date.parse` cannot be used for this: it accepts 2026-02-30 and silently
 * rolls it forward to 2026-03-02, so an impossible date would be stored as a
 * different, valid-looking day. Comparing the round-trip catches that.
 */
function isRealCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

export const uuidSchema = z.uuid('Must be a valid UUID')

/** Up to 2 decimal places, no exponent notation, no thousands separators. */
export const amountInputSchema = z
  .string()
  .trim()
  .min(1, 'Amount is required')
  .max(15, 'Amount is too large')
  .regex(/^\d*\.?\d{0,2}$/, 'Amount must be a positive number with at most 2 decimal places')
  .refine((value) => Number(value) > 0, 'Amount must be greater than zero')

/**
 * Base shape, kept free of refinements.
 *
 * Zod 4 rejects `.partial()` on a schema that has been refined, so the
 * cross-field rules live in a separate function applied afterwards. Keeping the
 * base plain also lets the update schema reuse it.
 */
const transactionFields = {
  type: transactionTypeSchema,
  amount: amountInputSchema,
  accountId: uuidSchema,
  counterpartyAccountId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  description: z.string().trim().max(500, 'Description is too long').optional(),
  occurredOn: isoDateSchema,
}

/** Flatten a Zod error to one message per field, for form display. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    // Keep the first message per field; a form shows one line per field.
    if (!result[key]) result[key] = issue.message
  }
  return result
}

export const createTransactionSchema = z.object(transactionFields).superRefine((data, ctx) => {
  // Cross-field rules, mirroring the database CHECK constraints so the user
  // gets a useful message instead of a raw Postgres error. The database
  // remains the source of truth; this only improves the feedback loop.
  if (data.type === 'transfer') {
    if (!data.counterpartyAccountId) {
      ctx.addIssue({
        code: 'custom',
        path: ['counterpartyAccountId'],
        message: 'A transfer needs a destination account',
      })
    } else if (data.counterpartyAccountId === data.accountId) {
      ctx.addIssue({
        code: 'custom',
        path: ['counterpartyAccountId'],
        message: 'Source and destination must be different accounts',
      })
    }
  } else if (data.counterpartyAccountId) {
    ctx.addIssue({
      code: 'custom',
      path: ['counterpartyAccountId'],
      message: 'Only a transfer can have a destination account',
    })
  }

  if (data.type !== 'transfer' && !data.categoryId) {
    ctx.addIssue({
      code: 'custom',
      path: ['categoryId'],
      message: 'Income and expense need a category',
    })
  }

  if (data.type === 'transfer' && data.categoryId) {
    ctx.addIssue({
      code: 'custom',
      path: ['categoryId'],
      message: 'A transfer cannot have a category',
    })
  }
})

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>

/**
 * Partial update.
 *
 * The cross-field rules are deliberately NOT re-applied on update. A partial
 * patch such as `{ id, description }` carries no `type`, so it cannot be
 * checked against the transfer rules, and re-validating only the provided
 * fields would reject perfectly valid partial updates. The authoritative
 * invariant is the database CHECK constraint, which sees the merged row.
 */
export const updateTransactionSchema = z
  .object({
    id: uuidSchema,
    type: transactionTypeSchema.optional(),
    amount: amountInputSchema.optional(),
    accountId: uuidSchema.optional(),
    counterpartyAccountId: uuidSchema.optional(),
    categoryId: uuidSchema.optional(),
    description: z.string().trim().max(500, 'Description is too long').optional(),
    occurredOn: isoDateSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 1, {
    message: 'Provide at least one field to update',
  })

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80, 'Name is too long'),
  kind: accountKindSchema,
  openingBalance: amountInputSchema.optional(),
})

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50, 'Name is too long'),
  type: categoryTypeSchema,
})

export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>