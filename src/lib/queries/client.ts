/**
 * Browser-bound query facade.
 *
 * The same signatures as `server.ts`, so a component can be moved between the
 * two by changing one import line. Behind it is the identical implementation in
 * `lib/queries/*` — there is exactly one copy of every financial read in this
 * repository, and this is the reason that could be arranged.
 *
 * RLS is what makes it safe. `auth.uid()` is read from the caller's JWT by
 * PostgREST, the same Postgres role is set, and the same policies evaluate. The
 * tenancy boundary was never a property of server rendering (ADR-001, ADR-002).
 *
 * The context is memoised for the life of the tab, which matters more here than
 * on the server: building it costs two round-trips (`getUser()` against the auth
 * server, then `workspace_members`), and every query on every screen asks for
 * it. Uncached, a dashboard would issue it four times before painting anything.
 *
 * `clearClientContext()` must be called on sign-out. A retained context would
 * keep the previous user's `workspaceId` reachable, and the first query after
 * signing in as someone else would read the wrong workspace.
 */
import { createClient } from '@/lib/supabase/client'
import { createQueryContext, getProfile as getProfileImpl, type QueryContext } from './context'
import {
  createAccount as createAccountImpl,
  createCategory as createCategoryImpl,
  getAccountBalances as getAccountBalancesImpl,
  getTotalsForRange as getTotalsForRangeImpl,
  getWorkspaceTotals as getWorkspaceTotalsImpl,
  listAccounts as listAccountsImpl,
  listCategories as listCategoriesImpl,
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

let pending: Promise<QueryContext> | null = null

export function clientContext(): Promise<QueryContext> {
  pending ??= createQueryContext(createClient())
  return pending
}

export function clearClientContext(): void {
  pending = null
}

export const listAccounts = async (includeArchived = false) =>
  listAccountsImpl(await clientContext(), includeArchived)

export const listCategories = async (type?: CategoryType) =>
  listCategoriesImpl(await clientContext(), type)

/**
 * Balance corrections, read in the browser.
 *
 * The Account screen needs these to *show why a balance is what it is*, which is
 * the thing the edit sheet could not do before: the opening balance on screen and
 * the balance the user sees are different numbers, and only an adjustment makes the
 * difference legible. See ADR-045.
 */
export const listAdjustments = async (accountId?: string) =>
  listAdjustmentsImpl(await clientContext(), accountId)

export const createAccount = async (input: {
  name: string
  kind: AccountKind
  openingBalance?: string
}) => createAccountImpl(await clientContext(), input)

export const createCategory = async (input: { name: string; type: CategoryType }) =>
  createCategoryImpl(await clientContext(), input)

export const getTotalsForRange = async (range: { from: string; to: string }) =>
  getTotalsForRangeImpl(await clientContext(), range)

export const getWorkspaceTotals = async () => getWorkspaceTotalsImpl(await clientContext())

export const getAccountBalances = async () => getAccountBalancesImpl(await clientContext())

export const listTransactions = async (filters: TransactionFilters = {}) =>
  listTransactionsImpl(await clientContext(), filters)

export const createTransaction = async (input: {
  type: TransactionType
  amount: string
  accountId: string
  categoryId?: string
  counterpartyAccountId?: string
  description?: string
  occurredOn: string
}) => createTransactionImpl(await clientContext(), input)

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
) => updateTransactionImpl(await clientContext(), id, input)

export const deleteTransaction = async (id: string) =>
  deleteTransactionImpl(await clientContext(), id)

export const getMonthlyTotals = async (range: DateRange) =>
  getMonthlyTotalsImpl(await clientContext(), range)

export const getExpenseByCategory = async (range: DateRange) =>
  getExpenseByCategoryImpl(await clientContext(), range)

export const getIncomeByCategory = async (range: DateRange) =>
  getIncomeByCategoryImpl(await clientContext(), range)

export const getPeriodSummary = async (range: DateRange) =>
  getPeriodSummaryImpl(await clientContext(), range)

export const listBudgetsWithProgress = async (today: string) =>
  listBudgetsWithProgressImpl(await clientContext(), today)

export const createBudget = async (input: { categoryId: string | null; amount: string }) =>
  createBudgetImpl(await clientContext(), input)

export const deleteBudget = async (id: string) => deleteBudgetImpl(await clientContext(), id)

export const listRecurring = async () => listRecurringImpl(await clientContext())

export const postRecurringOccurrence = async (recurringId: string, occurrenceDate: string) =>
  postRecurringOccurrenceImpl(await clientContext(), recurringId, occurrenceDate)

export const createRecurring = async (input: Parameters<typeof createRecurringImpl>[1]) =>
  createRecurringImpl(await clientContext(), input)

export const deleteRecurring = async (id: string) => deleteRecurringImpl(await clientContext(), id)

/**
 * Bound like every other function here. The raw `getProfile(ctx)` takes a
 * context; re-exporting it directly would leak that to callers and make this
 * facade the one exception to the rule that call sites never see a context.
 *
 * This is also the first thing every client screen needs, because it carries the
 * timezone (ADR-006) and the currency that figures are formatted in.
 */
export const getProfile = async () => getProfileImpl(await clientContext())

/** Pure: no context, no I/O. Re-exported so callers need only one import. */
export { toRecurringView } from './planning'
