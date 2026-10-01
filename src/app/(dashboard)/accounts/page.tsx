import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMinor, toMinor } from '@/lib/money'
import { listAccounts, getAccountBalances } from '@/lib/queries/reference'
import { AccountForm } from '@/components/accounts/AccountForm'

export default async function AccountsPage() {
  const { userId } = await requireUser()
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('currency')
    .eq('id', userId)
    .single()
  const currency = profile?.currency ?? 'BDT'

  const [accounts, balances] = await Promise.all([listAccounts(true), getAccountBalances()])
  const balanceFor = new Map(balances.map((b) => [b.account_id, b.balance]))

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Accounts</h1>

      <section className="rounded border border-neutral-200 p-4">
        <AccountForm />
      </section>

      {accounts.length === 0 ? (
        <p className="rounded border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
          No accounts yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded border border-neutral-200 px-4 py-3 text-sm"
            >
              <span>
                {a.name}
                {a.is_archived && <span className="ml-2 text-xs text-neutral-400">archived</span>}
              </span>
              <span className="font-medium tabular-nums">
                {formatMinor(toMinor(balanceFor.get(a.id) ?? a.opening_balance), { currency })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm text-neutral-500">
        Balances include transfers in both directions.{' '}
        <Link href="/dashboard" className="underline">
          Back to dashboard
        </Link>
      </p>
    </div>
  )
}
