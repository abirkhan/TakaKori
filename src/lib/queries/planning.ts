/**
 * Budgets and recurring transactions.
 *
 * Every function resolves the caller's workspace from the session. None accept
 * a workspace id.
 */

import { requireWorkspaceId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { dueOccurrences, upcomingOccurrences, type Frequency } from '@/lib/recurrence'
import { computeBudgetProgress, daysInCalendarMonth, monthStartOf } from '@/lib/budgets'
import type { BudgetProgress } from '@/lib/budgets'
import { toMinor, type Minor } from '@/lib/money'
import type { TransactionType } from '@/types/database'

export interface BudgetRow {
  id: string
  category_id: string | null
  amount: string | number
  category_name: string | null
}

export interface BudgetView extends BudgetProgress {
  id: string
  categoryId: string | null
  categoryName: string
  isOverall: boolean
}

/**
 * Budgets with live progress for the current month.
 *
 * The spend figure comes from the SQL aggregate rather than a client-side sum,
 * and the month bounds are resolved in the user's timezone so "this month"
 * means their month.
 */
export async function listBudgetsWithProgress(
  today: string,
): Promise<BudgetView[]> {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  const { data: budgets, error: budgetError } = await supabase
    .from('budgets')
    .select('id, category_id, amount, category:categories ( name )')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)

  if (budgetError) throw new Error(`Failed to load budgets: ${budgetError.message}`)

  const rows = (budgets ?? []) as unknown as {
    id: string
    category_id: string | null
    amount: string | number
    category: { name: string } | null
  }[]

  if (rows.length === 0) return []

  const monthStart = monthStartOf(today)
  // Spend so far runs month-start to TODAY, not to the end of the month.
  // Including future-dated rows would inflate "spent" on the 1st with money not
  // yet spent, and the pace projection would then be wildly wrong: a single
  // expense dated the 3rd, viewed on the 1st, looked like 2,500 spent in one day.
  const spendThrough = today

  // Actual spend per category so far this month, computed in SQL.
  const { data: spend, error: spendError } = await supabase.rpc(
    'expense_by_category_for_range',
    { target_workspace_id: workspaceId, range_from: monthStart, range_to: spendThrough },
  )
  if (spendError) throw new Error(`Failed to load spend: ${spendError.message}`)

  const spendByCategory = new Map<string, Minor>()
  for (const row of (spend ?? []) as { category_id: string | null; total: string | number }[]) {
    if (row.category_id) spendByCategory.set(row.category_id, toMinor(row.total))
  }

  const { data: summary, error: summaryError } = await supabase.rpc(
    'workspace_totals_for_range',
    { target_workspace_id: workspaceId, range_from: monthStart, range_to: spendThrough },
  )
  if (summaryError) throw new Error(`Failed to load month total: ${summaryError.message}`)

  const totalMonthExpense = toMinor(
    (Array.isArray(summary) ? summary[0]?.total_expense : summary?.total_expense) ?? 0,
  )

  const daysInMonth = daysInCalendarMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7)))

  return rows.map((row) => {
    const limit = toMinor(row.amount)
    const spent = row.category_id
      ? (spendByCategory.get(row.category_id) ?? 0)
      : totalMonthExpense
    const isOverall = row.category_id === null

    return {
      id: row.id,
      categoryId: row.category_id,
      categoryName: isOverall ? 'All spending' : (row.category?.name ?? 'Uncategorised'),
      isOverall,
      ...computeBudgetProgress(limit, spent, { monthStart, today, daysInMonth }),
    }
  })
}

export async function createBudget(input: {
  categoryId: string | null
  amount: string
}) {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('budgets')
    .insert({ workspace_id: workspaceId, category_id: input.categoryId, amount: input.amount })
    .select('id')
    .single()

  // The partial unique indexes are what actually enforce one budget per slot.
  if (error?.code === '23505') {
    throw new Error(
      input.categoryId
        ? 'That category already has a budget.'
        : 'You already have an overall spending budget.',
    )
  }
  if (error) throw new Error(`Failed to create budget: ${error.message}`)
  return data
}

export async function deleteBudget(id: string) {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('budgets')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`Failed to delete budget: ${error.message}`)
  if (!data) throw new Error('Budget not found')
  return data
}

// ---------------------------------------------------------------------------
// Recurring transactions
// ---------------------------------------------------------------------------

export interface RecurringRow {
  id: string
  type: string
  amount: string | number
  description: string | null
  frequency: string
  interval_count: number
  anchor_date: string
  ends_on: string | null
  last_posted_on: string | null
  account_id: string
  category_id: string | null
  counterparty_account_id: string | null
  account_name: string | null
  category_name: string | null
  counterparty_name: string | null
}

export async function listRecurring(): Promise<RecurringRow[]> {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('recurring_transactions')
    .select(
      `id, type, amount, description, frequency, interval_count, anchor_date,
       ends_on, last_posted_on, account_id, category_id, counterparty_account_id,
       account:accounts!recurring_transactions_account_id_fkey ( name ),
       category:categories ( name ),
       counterparty:accounts!recurring_transactions_counterparty_account_id_fkey ( name )`,
    )
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .order('anchor_date')

  if (error) throw new Error(`Failed to load recurring transactions: ${error.message}`)
  return (data ?? []) as unknown as RecurringRow[]
}

export interface RecurringView extends RecurringRow {
  /** Occurrences already due and not yet posted, oldest first. */
  due: { date: string; clamped: boolean }[]
  /** The next few future occurrences, for reassurance. */
  upcoming: { date: string; clamped: boolean }[]
  nextDate: string | null
}

export function toRecurringView(row: RecurringRow, today: string): RecurringView {
  const rule = {
    frequency: row.frequency as Frequency,
    interval: row.interval_count,
    anchorDate: row.anchor_date,
    endsOn: row.ends_on,
  }

  // The series is walked from the anchor, not from today, so a rule created
  // months ago does not silently skip the occurrences in between.
  const due = dueOccurrences(rule, row.anchor_date, today, row.last_posted_on)
  const upcoming = upcomingOccurrences(rule, today, 3)
  const nextDate = due[0]?.date ?? upcoming[0]?.date ?? null

  return { ...row, due, upcoming, nextDate }
}

/**
 * Post one occurrence as a real transaction, then advance `last_posted_on`.
 *
 * This is the whole point of the predict-and-confirm design: the user states
 * that the payment happened, and only then is a row written. The guard is
 * enforced in the UPDATE's WHERE clause rather than trusted from the client, so
 * a double submission cannot create a duplicate.
 */
export async function postRecurringOccurrence(
  recurringId: string,
  occurrenceDate: string,
): Promise<void> {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  const { data: rule, error: loadError } = await supabase
    .from('recurring_transactions')
    .select('id, type, amount, description, account_id, category_id, counterparty_account_id, anchor_date, last_posted_on, frequency, interval_count, ends_on')
    .eq('id', recurringId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (loadError) throw new Error(`Failed to load rule: ${loadError.message}`)
  if (!rule) throw new Error('Rule not found')

  const row = rule as unknown as RecurringRow

  // Idempotency check: refuse if this occurrence or an earlier one is posted.
  if (row.last_posted_on && occurrenceDate <= row.last_posted_on) {
    throw new Error('That occurrence has already been posted.')
  }

  const { error: insertError } = await supabase.from('transactions').insert({
    workspace_id: workspaceId,
    account_id: row.account_id,
    category_id: row.type === 'transfer' ? null : row.category_id,
    counterparty_account_id:
      row.type === 'transfer' ? row.counterparty_account_id : null,
    type: row.type,
    amount: row.amount,
    description: row.description,
    occurred_on: occurrenceDate,
  })

  if (insertError) throw new Error(`Failed to post the transaction: ${insertError.message}`)

  // Advance the watermark. eq guards make a concurrent second post a no-op.
  const { error: advanceError } = await supabase
    .from('recurring_transactions')
    .update({ last_posted_on: occurrenceDate })
    .eq('id', recurringId)
    .eq('workspace_id', workspaceId)
    .or(`last_posted_on.is.null,last_posted_on.lt.${occurrenceDate}`)

  if (advanceError) {
    throw new Error(
      'The transaction was saved but the rule could not be updated. ' +
        'Check for a duplicate before posting again.',
    )
  }
}

export async function createRecurring(input: {
  type: TransactionType
  amount: string
  accountId: string
  categoryId?: string
  counterpartyAccountId?: string
  description?: string
  frequency: Frequency
  intervalCount: number
  anchorDate: string
  endsOn?: string | null
}) {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('recurring_transactions')
    .insert({
      workspace_id: workspaceId,
      account_id: input.accountId,
      category_id: input.type === 'transfer' ? null : (input.categoryId ?? null),
      counterparty_account_id:
        input.type === 'transfer' ? (input.counterpartyAccountId ?? null) : null,
      type: input.type,
      amount: input.amount,
      description: input.description ?? null,
      frequency: input.frequency,
      interval_count: input.intervalCount,
      anchor_date: input.anchorDate,
      ends_on: input.endsOn ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create rule: ${error.message}`)
  return data
}

export async function deleteRecurring(id: string) {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('recurring_transactions')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`Failed to delete rule: ${error.message}`)
  if (!data) throw new Error('Rule not found')
  return data
}