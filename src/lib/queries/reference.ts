/**
 * Reference data: accounts, categories, and workspace totals.
 *
 * Totals come from the SQL views, not from summing rows in JavaScript. The
 * views already encode the transfer semantics correctly and use
 * `security_invoker`, so RLS applies to the caller — which is also why this
 * module runs unchanged in the browser. See `context.ts`.
 */

import type { QueryContext } from './context'
import type { AccountKind, CategoryType } from '@/types/database'

export interface Account {
  id: string
  name: string
  kind: string
  opening_balance: string | number
  is_archived: boolean
}

/**
 * A signed correction to an account balance.
 *
 * Lives outside `transactions` on purpose — see ADR-045. An adjustment is neither
 * income nor spending, so keeping it out of the transaction table is what stops a
 * correction from inflating "income this month". `amount` is signed, where a
 * transaction's is positive with the direction in `type`.
 */
export interface AccountAdjustment {
  id: string
  account_id: string
  amount: string | number
  reason: string | null
  created_at: string
}

export async function listAdjustments(
  ctx: QueryContext,
  accountId?: string,
): Promise<AccountAdjustment[]> {
  const { supabase } = ctx
  const query = supabase
    .from('account_adjustments')
    .select('id, account_id, amount, reason, created_at')
    .order('created_at', { ascending: false })

  const { data, error } = accountId ? await query.eq('account_id', accountId) : await query

  if (error) throw new Error(`Failed to load adjustments: ${error.message}`)
  return data ?? []
}

/**
 * Record a correction.
 *
 * The balance moves because of a row that says so, rather than because a starting
 * point was overwritten with no explanation — which is the entire reason this table
 * exists.
 */
export async function createAdjustment(
  ctx: QueryContext,
  input: { accountId: string; amount: string; reason?: string },
) {
  const { supabase, workspaceId } = ctx

  const { data, error } = await supabase
    .from('account_adjustments')
    .insert({
      workspace_id: workspaceId,
      account_id: input.accountId,
      amount: input.amount,
      reason: input.reason ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to record the adjustment: ${error.message}`)
  return data
}

/**
 * Undo an adjustment.
 *
 * Both `.eq`s: `id` because PostgREST matches every row without it, and
 * `workspace_id` to match every other write in this layer.
 */
export async function deleteAdjustment(ctx: QueryContext, input: { id: string }) {
  const { supabase, workspaceId } = ctx

  const { error } = await supabase
    .from('account_adjustments')
    .delete()
    .eq('id', input.id)
    .eq('workspace_id', workspaceId)

  if (error) throw new Error(`Failed to remove the adjustment: ${error.message}`)
}

export interface Category {
  id: string
  name: string
  type: string
  is_system: boolean
}

export async function listAccounts(ctx: QueryContext, includeArchived = false): Promise<Account[]> {
  const { supabase, workspaceId } = ctx

  let query = supabase
    .from('accounts')
    .select('id, name, kind, opening_balance, is_archived')
    .eq('workspace_id', workspaceId)
    .order('name')

  if (!includeArchived) query = query.eq('is_archived', false)

  const { data, error } = await query
  if (error) throw new Error(`Failed to list accounts: ${error.message}`)
  return (data ?? []) as unknown as Account[]
}

export async function listCategories(ctx: QueryContext, type?: CategoryType): Promise<Category[]> {
  const { supabase, workspaceId } = ctx

  let query = supabase
    .from('categories')
    .select('id, name, type, is_system')
    .eq('workspace_id', workspaceId)
    .order('name')

  if (type) query = query.eq('type', type)

  const { data, error } = await query
  if (error) throw new Error(`Failed to list categories: ${error.message}`)
  return (data ?? []) as unknown as Category[]
}

export async function createAccount(
  ctx: QueryContext,
  input: {
    name: string
    kind: AccountKind
    openingBalance?: string
  },
) {
  const { supabase, workspaceId } = ctx

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      workspace_id: workspaceId,
      name: input.name,
      kind: input.kind,
      opening_balance: input.openingBalance ?? '0.00',
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create account: ${error.message}`)
  return data
}

export async function createCategory(
  ctx: QueryContext,
  input: { name: string; type: CategoryType },
) {
  const { supabase, workspaceId } = ctx

  const { data, error } = await supabase
    .from('categories')
    .insert({ workspace_id: workspaceId, name: input.name, type: input.type })
    .select('id')
    .single()

  // The unique index is (workspace_id, type, lower(name)).
  if (error?.code === '23505') {
    throw new Error(`You already have a ${input.type} category called "${input.name}".`)
  }
  if (error) throw new Error(`Failed to create category: ${error.message}`)
  return data
}

/**
 * Change an account.
 *
 * **Editing `opening_balance` is the whole reason this exists, and it has no
 * ledger entry behind it.** The balance moves because the *starting point* moved,
 * not because anything was spent or earned, so no transaction explains the
 * difference. That is the right trade for correcting a figure you mistyped on a
 * brand-new account — there was never a true balance to preserve — and it is worth
 * knowing that the app cannot afterwards say why the number is what it is.
 *
 * `workspaceId` is filtered on as well as `id`, matching every other write here.
 */
export async function updateAccount(
  ctx: QueryContext,
  input: { id: string; name: string; kind: AccountKind; openingBalance?: string },
) {
  const { supabase, workspaceId } = ctx

  /**
   * `opening_balance` is included **only when the caller supplied it**.
   *
   * This is the difference between a patch and a merge, and getting it wrong is
   * silent data loss rather than an error: PostgREST's `PATCH` only touches the
   * keys present in the body, so sending `{ opening_balance: undefined }` leaves
   * the balance alone — but sending the *string* `'0.00'` because a form field was
   * absent overwrites a real balance with nothing. Verified earlier in this
   * project: an account showing ৳5,000.00 had `opening_balance` 0.00, which is
   * exactly that bug, already committed to the database.
   *
   * So the caller omitting the field is meaningful and is honoured as "leave this
   * one alone", and the edit sheet omits it because a correction now goes through
   * `account_adjustments` where it is visible (ADR-045).
   */
  const patch: { name: string; kind: AccountKind; opening_balance?: string } = {
    name: input.name,
    kind: input.kind,
  }
  if (input.openingBalance !== undefined) patch.opening_balance = input.openingBalance

  const { data, error } = await supabase
    .from('accounts')
    .update(patch)
    .eq('id', input.id)
    .eq('workspace_id', workspaceId)
    .select('id')
    .single()

  if (error) throw new Error(`Failed to update account: ${error.message}`)
  return data
}

/** How many transactions point at an account. The guard on deleting one. */
export async function countAccountTransactions(
  ctx: QueryContext,
  accountId: string,
): Promise<number> {
  const { supabase } = ctx
  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)

  if (error) throw new Error(`Failed to count transactions: ${error.message}`)
  return count ?? 0
}

/**
 * Delete an account, refusing one that has history.
 *
 * **The refusal is the point.** `transactions.account_id` is `on delete restrict`,
 * so Postgres would reject it anyway — but a foreign-key error is not an
 * explanation a person can act on. Counting first turns "something went wrong" into
 * "this account has 14 transactions, so delete would take them with it".
 *
 * An empty account is a thing people create by accident, and an empty account is
 * safe to remove. Anything with history is what `archiveAccount` is for.
 */
export async function deleteAccount(ctx: QueryContext, input: { id: string }) {
  const { supabase, workspaceId } = ctx

  const transactions = await countAccountTransactions(ctx, input.id)
  if (transactions > 0) {
    throw new Error(
      `This account has ${transactions} transaction${transactions === 1 ? '' : 's'}, so it cannot be deleted. Archive it instead to keep the history.`,
    )
  }

  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', input.id)
    .eq('workspace_id', workspaceId)

  if (error) throw new Error(`Failed to delete account: ${error.message}`)
}

/**
 * Hide an account while keeping its history.
 *
 * The column has existed since the initial schema with nothing writing to it, which
 * says the design expected archiving rather than deletion. It is also the only way
 * to retire an account that has transactions — see `deleteAccount`.
 */
export async function archiveAccount(ctx: QueryContext, input: { id: string }) {
  const { supabase, workspaceId } = ctx

  const { error } = await supabase
    .from('accounts')
    .update({ is_archived: true })
    .eq('id', input.id)
    .eq('workspace_id', workspaceId)

  if (error) throw new Error(`Failed to archive account: ${error.message}`)
}

/**
 * Rename a category.
 *
 * Transactions point at `category_id`, not at the name, so renaming is safe and
 * every past transaction follows the new name. Same unique index as the create:
 * (workspace, type, lower(name)).
 */
export async function updateCategory(
  ctx: QueryContext,
  input: { id: string; name: string; type: CategoryType },
) {
  const { supabase, workspaceId } = ctx

  const { data, error } = await supabase
    .from('categories')
    .update({ name: input.name, type: input.type })
    .eq('id', input.id)
    .eq('workspace_id', workspaceId)
    .select('id')
    .single()

  if (error?.code === '23505') {
    throw new Error(`You already have a ${input.type} category called "${input.name}".`)
  }
  if (error) throw new Error(`Failed to update category: ${error.message}`)
  return data
}

/**
 * Delete a category.
 *
 * **No guard, because the schema already made this safe.** `category_id` is
 * `on delete set null`, so the transactions that used it survive as orphans rather
 * than going with it — and Reports already renders those as "Uncategorised" rather
 * than hiding them. Deleting a category therefore cannot lose a transaction, which
 * is why it needs no count and no confirmation beyond saying what will happen.
 */
export async function deleteCategory(ctx: QueryContext, input: { id: string }) {
  const { supabase, workspaceId } = ctx

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', input.id)
    .eq('workspace_id', workspaceId)

  if (error) throw new Error(`Failed to delete category: ${error.message}`)
}

export interface WorkspaceTotals {
  total_income: string | number
  total_expense: string | number
  net_balance: string | number
  total_transferred: string | number
}

/**
 * Totals for an inclusive date range, computed in SQL.
 *
 * This is the function to use for any period-specific figure ("this month",
 * "last quarter"). The workspace_totals *view* is range-free and therefore
 * answers lifetime questions only — labelling its output as "this month" would
 * be wrong, so do not do that.
 */
export async function getTotalsForRange(
  ctx: QueryContext,
  range: {
    from: string
    to: string
  },
): Promise<(WorkspaceTotals & { transaction_count: number }) | null> {
  const { supabase, workspaceId } = ctx

  const { data, error } = await supabase.rpc('workspace_totals_for_range', {
    target_workspace_id: workspaceId,
    range_from: range.from,
    range_to: range.to,
  })

  if (error) throw new Error(`Failed to load range totals: ${error.message}`)
  const row = (Array.isArray(data) ? data[0] : data) as
    (WorkspaceTotals & { transaction_count: number }) | null
  return row ?? null
}

/** All-time workspace totals. */
export async function getWorkspaceTotals(ctx: QueryContext): Promise<WorkspaceTotals | null> {
  const { supabase, workspaceId } = ctx

  const { data, error } = await supabase
    .from('workspace_totals')
    .select('total_income, total_expense, net_balance, total_transferred')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load totals: ${error.message}`)
  return (data as unknown as WorkspaceTotals) ?? null
}

export interface AccountBalance {
  account_id: string
  name: string
  kind: string
  balance: string | number
}

export async function getAccountBalances(ctx: QueryContext): Promise<AccountBalance[]> {
  const { supabase, workspaceId } = ctx

  const { data, error } = await supabase
    .from('account_balances')
    .select('account_id, name, kind, balance')
    .eq('workspace_id', workspaceId)
    .order('name')

  if (error) throw new Error(`Failed to load balances: ${error.message}`)
  return (data ?? []) as unknown as AccountBalance[]
}
