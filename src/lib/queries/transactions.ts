/**
 * Transaction data access.
 *
 * All reads and writes for transactions live here. Pages and Server Actions
 * call into this module; they do not build Supabase queries inline.
 *
 * Two rules are enforced here on every function:
 *   1. `workspace_id` is resolved from the session, never from caller input.
 *   2. Mutations filter on the primary key. An unfiltered DELETE or PATCH in
 *      PostgREST matches every row in the table.
 */

import { requireWorkspaceId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { TransactionType } from '@/types/database'

export interface TransactionFilters {
  from?: string
  to?: string
  type?: TransactionType
  categoryId?: string
  accountId?: string
  limit?: number
  offset?: number
}

/**
 * A transaction joined with its category and both account names, ready for
 * display. Amounts stay as raw strings/numbers from Postgres — the caller
 * formats them via lib/money.ts.
 */
export interface TransactionWithRelations {
  id: string
  type: string
  amount: string | number
  description: string | null
  occurred_on: string
  created_at: string
  category_id: string | null
  account_id: string
  counterparty_account_id: string | null
  category: { id: string; name: string; type: string } | null
  account: { id: string; name: string; kind: string } | null
  counterparty_account: { id: string; name: string; kind: string } | null
}

export async function listTransactions(filters: TransactionFilters = {}) {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  let query = supabase
    .from('transactions')
    .select(
      `
        id, type, amount, description, occurred_on, created_at,
        category_id, account_id, counterparty_account_id,
        category:categories ( id, name, type ),
        account:accounts!transactions_account_id_fkey ( id, name, kind ),
        counterparty_account:accounts!transactions_counterparty_account_id_fkey ( id, name, kind )
      `,
    )
    .eq('workspace_id', workspaceId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.from) query = query.gte('occurred_on', filters.from)
  if (filters.to) query = query.lte('occurred_on', filters.to)
  if (filters.type) query = query.eq('type', filters.type)
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
  if (filters.accountId) query = query.eq('account_id', filters.accountId)

  query = query.range(
    filters.offset ?? 0,
    (filters.offset ?? 0) + (filters.limit ?? 50) - 1,
  )

  const { data, error } = await query
  if (error) throw new Error(`Failed to list transactions: ${error.message}`)

  return (data ?? []) as unknown as TransactionWithRelations[]
}

export async function createTransaction(input: {
  type: TransactionType
  amount: string
  accountId: string
  categoryId?: string
  counterpartyAccountId?: string
  description?: string
  occurredOn: string
}) {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      workspace_id: workspaceId,
      account_id: input.accountId,
      category_id: input.type === 'transfer' ? null : input.categoryId,
      counterparty_account_id: input.type === 'transfer' ? input.counterpartyAccountId : null,
      type: input.type,
      // numeric arrives as a string; send it back in the same shape rather
      // than letting JS coerce it through a float.
      amount: input.amount,
      description: input.description ?? null,
      occurred_on: input.occurredOn,
    })
    .select('id')
    .single()

  if (error) {
    // The database enforces the shape invariants. Surface a readable message
    // rather than leaking the raw Postgres text to the UI.
    if (error.code === '23514' || error.code === '23505') {
      throw new Error('That transaction is not valid. Check the amount, category and accounts.')
    }
    throw new Error(`Failed to create transaction: ${error.message}`)
  }

  return data
}

export async function updateTransaction(
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
) {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  const patch: Record<string, unknown> = {}
  if (input.type !== undefined) patch.type = input.type
  if (input.amount !== undefined) patch.amount = input.amount
  if (input.accountId !== undefined) patch.account_id = input.accountId
  if (input.categoryId !== undefined) patch.category_id = input.categoryId
  if (input.counterpartyAccountId !== undefined)
    patch.counterparty_account_id = input.counterpartyAccountId
  if (input.description !== undefined) patch.description = input.description
  if (input.occurredOn !== undefined) patch.occurred_on = input.occurredOn

  // eq('id', id) is mandatory. Without it this updates every row in the table.
  const { data, error } = await supabase
    .from('transactions')
    .update(patch)
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`Failed to update transaction: ${error.message}`)
  // No error and no row means the id does not belong to this workspace. RLS
  // filtered it out silently rather than reporting a violation.
  if (!data) throw new Error('Transaction not found')

  return data
}

export async function deleteTransaction(id: string) {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  // eq('id', id) is mandatory — see updateTransaction.
  const { data, error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`Failed to delete transaction: ${error.message}`)
  if (!data) throw new Error('Transaction not found')

  return data
}