import { NextResponse } from 'next/server'
import { requireUserOrThrow, UnauthorizedError } from '@/lib/auth'
import { requireWorkspaceId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { transactionsToCsv } from '@/lib/csv'
import { todayIn } from '@/lib/dates'

/**
 * CSV export.
 *
 * Users must be able to take their data out. Auth is enforced here explicitly:
 * a Route Handler is not covered by the proxy matcher, so relying on the proxy
 * would hand everyone's transactions to anyone who guessed the URL.
 *
 * Scope is the caller's workspace, resolved from the session — never from a
 * query parameter.
 */
export async function GET() {
  let userId: string
  try {
    ;({ userId } = await requireUserOrThrow())
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    throw error
  }

  const workspaceId = await requireWorkspaceId()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single()

  const timezone = profile?.timezone ?? 'Asia/Dhaka'

  const { data, error } = await supabase
    .from('transactions')
    .select(
      `id, occurred_on, type, amount, description,
       category:categories ( name ),
       account:accounts!transactions_account_id_fkey ( name ),
       counterparty_account:accounts!transactions_counterparty_account_id_fkey ( name )`,
    )
    .eq('workspace_id', workspaceId)
    .order('occurred_on', { ascending: false })
    .limit(10_000)

  if (error) {
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 })
  }

  const rows = (data ?? []).map((row) => {
    const pick = (v: unknown) =>
      Array.isArray(v) ? (v[0] as { name?: string } | null) : (v as { name?: string } | null)

    return {
      id: row.id as string,
      occurred_on: row.occurred_on as string,
      type: row.type as string,
      amount: row.amount as string | number,
      description: (row.description as string | null) ?? null,
      category_name: pick(row.category)?.name ?? null,
      account_name: pick(row.account)?.name ?? null,
      counterparty_account_name: pick(row.counterparty_account)?.name ?? null,
    }
  })

  const csv = transactionsToCsv(rows)
  const filename = `takakori-${todayIn(timezone)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // Financial data must not be cached by intermediaries.
      'Cache-Control': 'no-store',
    },
  })
}