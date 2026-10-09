/**
 * Server-bound query facade.
 *
 * Every function here has the same signature it always had. The only difference
 * is that the context is supplied for you. That is the whole trick behind
 * moving the data layer into the browser without duplicating it: `lib/queries/*`
 * became context-parameterised, and each transport got a thin binding.
 *
 * Call sites in Server Components, Server Actions and Route Handlers change
 * *which module they import from* — one import line — and nothing else.
 *
 * The context is memoised per request by React's `cache`. That is not a
 * performance nicety: it is what keeps `workspace_id` the same value across a
 * single render, so a page cannot read under one workspace and write under
 * another if a membership changed mid-flight.
 *
 * Server-only by construction — `@/lib/supabase/server` reaches for
 * `next/headers`, so nothing importing this file will bundle for the browser.
 */
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createQueryContext, getProfile as getProfileImpl, type QueryContext } from './context'
import {
  createAccount as createAccountImpl,
  createCategory as createCategoryImpl,
  getAccountBalances as getAccountBalancesImpl,
  getTotalsForRange as getTotalsForRangeImpl,
  getWorkspaceTotals as getWorkspaceTotalsImpl,
  listAccounts as listAccountsImpl,
  listCategories as listCategoriesImpl,
  updateAccount as updateAccountImpl,
  deleteAccount as deleteAccountImpl,
  archiveAccount as archiveAccountImpl,
  updateCategory as updateCategoryImpl,
  deleteCategory as deleteCategoryImpl,
  createAdjustment as createAdjustmentImpl,
  deleteAdjustment as deleteAdjustmentImpl,
  listAdjustments as listAdjustmentsImpl,
} from './reference'
import {
  createTransaction as createTransactionImpl,
  deleteTransaction as deleteTransactionImpl,
  listTransactions as listTransactionsImpl,
  updateTransaction as updateTransactionImpl,
  type TransactionFilters,
} from './transactions'
import {
  getExpenseByCategory as getExpenseByCategoryImpl,
  getIncomeByCategory as getIncomeByCategoryImpl,
  getMonthlyTotals as getMonthlyTotalsImpl,
  getPeriodSummary as getPeriodSummaryImpl,
} from './reports'
import {
  createBudget as createBudgetImpl,
  createRecurring as createRecurringImpl,
  deleteBudget as deleteBudgetImpl,
  deleteRecurring as deleteRecurringImpl,
  listBudgetsWithProgress as listBudgetsWithProgressImpl,
  listRecurring as listRecurringImpl,
  postRecurringOccurrence as postRecurringOccurrenceImpl,
} from './planning'
import type { DateRange } from '@/lib/dates'
import type { AccountKind, CategoryType, TransactionType } from '@/types/database'

export const serverContext = cache(async (): Promise<QueryContext> =>
  createQueryContext(await createClient()),
)

export const listAccounts = async (includeArchived = false) =>
  listAccountsImpl(await serverContext(), includeArchived)

export const listCategories = async (type?: CategoryType) =>
  listCategoriesImpl(await serverContext(), type)

export const createAccount = async (input: {
  name: string
  kind: AccountKind
  openingBalance?: string
}) => createAccountImpl(await serverContext(), input)

export const createCategory = async (input: { name: string; type: CategoryType }) =>
  createCategoryImpl(await serverContext(), input)

/** Balance corrections. See ADR-045 and `account_adjustments`. */
export const createAdjustment = async (input: {
  accountId: string
  amount: string
  reason?: string
}) => createAdjustmentImpl(await serverContext(), input)

export const deleteAdjustment = async (input: { id: string }) =>
  deleteAdjustmentImpl(await serverContext(), input)

export const listAdjustments = async (accountId?: string) =>
  listAdjustmentsImpl(await serverContext(), accountId)

/**
 * The writes that did not exist when this module was written: correcting an account,
 * removing or archiving one, and renaming or removing a category. Each resolves the
 * context itself, exactly as the creates do — a caller cannot supply a workspace id.
 */
export const updateAccount = async (input: {
  id: string
  name: string
  kind: AccountKind
  openingBalance: string
}) => updateAccountImpl(await serverContext(), input)

export const deleteAccount = async (input: { id: string }) =>
  deleteAccountImpl(await serverContext(), input)

export const archiveAccount = async (input: { id: string }) =>
  archiveAccountImpl(await serverContext(), input)

export const updateCategory = async (input: {
  id: string
  name: string
  type: CategoryType
}) => updateCategoryImpl(await serverContext(), input)

export const deleteCategory = async (input: { id: string }) =>
  deleteCategoryImpl(await serverContext(), input)

export const getTotalsForRange = async (range: { from: string; to: string }) =>
  getTotalsForRangeImpl(await serverContext(), range)

export const getWorkspaceTotals = async () => getWorkspaceTotalsImpl(await serverContext())

export const getAccountBalances = async () => getAccountBalancesImpl(await serverContext())

export const listTransactions = async (filters: TransactionFilters = {}) =>
  listTransactionsImpl(await serverContext(), filters)

export const createTransaction = async (input: {
  type: TransactionType
  amount: string
  accountId: string
  categoryId?: string
  counterpartyAccountId?: string
  description?: string
  occurredOn: string
}) => createTransactionImpl(await serverContext(), input)

export const updateTransaction = async (
  id: string,
  input: Partial<{
    type: TransactionType
    amount: string
    accountId: string
    categoryId: string | null
    counterpartyAccountId: string | null
    description: string | null
    occurredOn: string
  }>,
) => updateTransactionImpl(await serverContext(), id, input)

export const deleteTransaction = async (id: string) =>
  deleteTransactionImpl(await serverContext(), id)

export const getMonthlyTotals = async (range: DateRange) =>
  getMonthlyTotalsImpl(await serverContext(), range)

export const getExpenseByCategory = async (range: DateRange) =>
  getExpenseByCategoryImpl(await serverContext(), range)

export const getIncomeByCategory = async (range: DateRange) =>
  getIncomeByCategoryImpl(await serverContext(), range)

export const getPeriodSummary = async (range: DateRange) =>
  getPeriodSummaryImpl(await serverContext(), range)

export const listBudgetsWithProgress = async (today: string) =>
  listBudgetsWithProgressImpl(await serverContext(), today)

export const createBudget = async (input: { categoryId: string | null; amount: string }) =>
  createBudgetImpl(await serverContext(), input)

export const deleteBudget = async (id: string) => deleteBudgetImpl(await serverContext(), id)

export const listRecurring = async () => listRecurringImpl(await serverContext())

export const postRecurringOccurrence = async (recurringId: string, occurrenceDate: string) =>
  postRecurringOccurrenceImpl(await serverContext(), recurringId, occurrenceDate)

export const createRecurring = async (input: Parameters<typeof createRecurringImpl>[1]) =>
  createRecurringImpl(await serverContext(), input)

export const deleteRecurring = async (id: string) => deleteRecurringImpl(await serverContext(), id)

/**
 * Bound like every other function here. The raw `getProfile(ctx)` takes a
 * context; re-exporting it directly would leak that to callers and make this
 * facade the one exception to the rule that call sites never see a context.
 */
export const getProfile = async () => getProfileImpl(await serverContext())

/** Pure: no context, no I/O. Re-exported so callers need only one import. */
export { toRecurringView } from './planning'
