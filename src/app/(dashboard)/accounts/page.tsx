import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMinor, toMinor } from '@/lib/money'
import { listAccounts, getAccountBalances } from '@/lib/queries/reference'
import { AccountForm } from '@/components/accounts/AccountForm'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatTile } from '@/components/ui/StatTile'
import { EmptyState } from '@/components/ui/EmptyState'
import { Row, RowLink } from '@/components/ui/Row'
import { Icon, iconForAccountKind } from '@/components/ui/Icon'
import { buttonClass } from '@/components/ui/button'

/**
 * Accounts.
 *
 * Doubles as the account tab in the bottom bar, which makes it the one screen
 * that has to hold three things at once: the balances, the form that creates
 * them, and the links to everything else that is not a top-level tab. Sections
 * are ordered by how often they are needed â€” balances, then create, then
 * settings â€” rather than alphabetically or by an imagined information
 * hierarchy.
 */
export default async function AccountsPage() {
  const { userId } = await requireUser()
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, currency')
    .eq('id', userId)
    .single()
  const currency = profile?.currency ?? 'BDT'

  const [accounts, balances] = await Promise.all([listAccounts(true), getAccountBalances()])
  const balanceFor = new Map(balances.map((b) => [b.account_id, b.balance]))

  const active = accounts.filter((a) => !a.is_archived)
  const total = active.reduce(
    (sum, a) => sum + toMinor(balanceFor.get(a.id) ?? a.opening_balance),
    0,
  )

  return (
    <div className="tk-stack">
      <PageHeader
        eyebrow={profile?.full_name ?? undefined}
        title="Account"
        action={
          <Link href="/dashboard" className={buttonClass('ghost', { size: 'sm' })}>
            <Icon name="home" size={16} />
            <span className="hidden sm:inline">Home</span>
          </Link>
        }
      />

      <section className="tk-card">
        <div className="flex items-start gap-3">
          <StatTile
            icon="wallet"
            tone="brand"
            label="Across all accounts"
            value={formatMinor(total, { currency })}
          />
          <StatTile icon="card" tone="sky" label="Accounts" value={active.length} />
          <StatTile
            icon="check"
            tone="teal"
            label="Archived"
            value={accounts.length - active.length}
          />
        </div>
      </section>

      <section>
        <h2 className="tk-section mb-3">Balances</h2>

        {accounts.length === 0 ? (
          <EmptyState
            icon="wallet"
            title="No accounts yet"
            description="Add the wallet, bank account or bKash number you actually spend from."
          />
        ) : (
          <ul className="tk-card divide-hairline flex flex-col divide-y p-1">
            {accounts.map((a) => (
              <li key={a.id}>
                <Row
                  icon={iconForAccountKind(a.kind)}
                  tone={a.is_archived ? 'sky' : 'brand'}
                  title={a.name}
                  subtitle={
                    <>
                      {a.kind.replace('_', ' ')}
                      {a.is_archived && (
                        <span className="tk-badge tk-badge-neutral ml-1.5">archived</span>
                      )}
                    </>
                  }
                  trailing={
                    <span
                      className={
                        toMinor(balanceFor.get(a.id) ?? a.opening_balance) < 0
                          ? 'tk-amount tk-expense'
                          : 'tk-amount'
                      }
                    >
                      {formatMinor(toMinor(balanceFor.get(a.id) ?? a.opening_balance), {
                        currency,
                      })}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}

        <p className="tk-caption mt-2">
          Balances include transfers in both directions. Moving money between your own accounts is
          neither income nor expense.
        </p>
      </section>

      <section className="tk-card">
        <AccountForm />
      </section>

      <section>
        <h2 className="tk-section mb-3">Manage</h2>
        <div className="tk-card divide-hairline flex flex-col divide-y p-1">
          <RowLink
            href="/budgets"
            icon="target"
            tone="amber"
            title="Budgets"
            subtitle="Monthly limits and pace"
          />
          <RowLink
            href="/recurring"
            icon="repeat"
            tone="violet"
            title="Recurring"
            subtitle="Rent, salary, subscriptions"
          />
          <RowLink
            href="/categories"
            icon="tag"
            tone="teal"
            title="Categories"
            subtitle="How your spending is labelled"
          />
          <RowLink
            href="/reports"
            icon="chart"
            tone="sky"
            title="Reports"
            subtitle="Trends and breakdowns"
          />
        </div>
      </section>
    </div>
  )
}
