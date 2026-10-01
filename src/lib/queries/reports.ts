/**
 * Reporting data access.
 *
 * Every aggregate is computed in SQL through the range-scoped RPCs. Nothing
 * here sums numbers in JavaScript: the values arrive as `numeric` strings and
 * adding them as JS numbers would reintroduce the float problem that
 * src/lib/money.ts exists to prevent.
 */

import { requireWorkspaceId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { DateRange } from '@/lib/dates'

export interface MonthlyTotal {
  /** First day of the month, as YYYY-MM-DD. */
  month: string
  total_income: string | number
  total_expense: string | number
  net_balance: string | number
  tx_count: number
}

export interface CategoryTotal {
  category_id: string | null
  category_name: string
  total: string | number
  tx_count: number
}

/**
 * Income and expense per calendar month.
 *
 * The SQL generates the month series, so months with no transactions are
 * returned as zeros rather than being omitted. A three-month saving streak
 * should read as three bars, not one.
 */
export async function getMonthlyTotals(range: DateRange): Promise<MonthlyTotal[]> {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('monthly_totals_for_range', {
    target_workspace_id: workspaceId,
    range_from: range.from,
    range_to: range.to,
  })

  if (error) throw new Error(`Failed to load monthly trend: ${error.message}`)
  return (data ?? []) as unknown as MonthlyTotal[]
}

export async function getExpenseByCategory(range: DateRange): Promise<CategoryTotal[]> {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('expense_by_category_for_range', {
    target_workspace_id: workspaceId,
    range_from: range.from,
    range_to: range.to,
  })

  if (error) throw new Error(`Failed to load category breakdown: ${error.message}`)
  return (data ?? []) as unknown as CategoryTotal[]
}

export async function getIncomeByCategory(range: DateRange): Promise<CategoryTotal[]> {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('income_by_category_for_range', {
    target_workspace_id: workspaceId,
    range_from: range.from,
    range_to: range.to,
  })

  if (error) throw new Error(`Failed to load income breakdown: ${error.message}`)
  return (data ?? []) as unknown as CategoryTotal[]
}

export interface PeriodSummary {
  total_income: string | number
  total_expense: string | number
  net_balance: string | number
  total_transferred: string | number
  transaction_count: number
}

/** Headline figures for a period, from the range-scoped aggregate. */
export async function getPeriodSummary(range: DateRange): Promise<PeriodSummary> {
  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('workspace_totals_for_range', {
    target_workspace_id: workspaceId,
    range_from: range.from,
    range_to: range.to,
  })

  if (error) throw new Error(`Failed to load period summary: ${error.message}`)
  const row = (Array.isArray(data) ? data[0] : data) as PeriodSummary | null

  return (
    row ?? {
      total_income: '0',
      total_expense: '0',
      net_balance: '0',
      total_transferred: '0',
      transaction_count: 0,
    }
  )
}
