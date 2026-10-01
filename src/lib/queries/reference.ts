/**
 * Reference data: accounts, categories, and workspace totals.
 *
 * Totals come from the SQL views, not from summing rows in JavaScript. The
 * views already encode the transfer semantics correctly and use
 * `security_invoker`, so RLS applies to the caller.
 */

import { requireWorkspaceId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { AccountKind, CategoryType } from '@/types/database'

export interface Account {
  id: string
  name: string
  kind: string
  opening_balance: string | number
  is_archived: boolean
}

export interface Category {
  id: string
  name: string
  type: string
  is_system: boolean
}

export async function listAccounts(includeArchived = false): Promise<Account[]> {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

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

export async function listCategories(type?: CategoryType): Promise<Category[]> {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

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

export async function createAccount(input: {
  name: string
  kind: AccountKind
  openingBalance?: string
}) {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

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

export async function createCategory(input: { name: string; type: CategoryType }) {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

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
export async function getTotalsForRange(range: {
  from: string
  to: string
}): Promise<(WorkspaceTotals & { transaction_count: number }) | null> {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

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
export async function getWorkspaceTotals(): Promise<WorkspaceTotals | null> {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

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

export async function getAccountBalances(): Promise<AccountBalance[]> {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('account_balances')
    .select('account_id, name, kind, balance')
    .eq('workspace_id', workspaceId)
    .order('name')

  if (error) throw new Error(`Failed to load balances: ${error.message}`)
  return (data ?? []) as unknown as AccountBalance[]
}
