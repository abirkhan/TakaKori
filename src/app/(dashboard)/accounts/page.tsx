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
 * Doubles as the account tab in the bottom bar, so it carries the balances and
 * the links to everything that is not a top-level tab. The create form used to
 * sit here too, which made one screen promise three unrelated things while the
 * tab label promised one; it is a sheet now, opened from the header, and the
 * screen is honestly "your accounts".
 *
 * Sections are ordered by how often they are needed — balances, then planning —
 * rather than alphabetically or by an imagined information hierarchy.
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
        eyebrow="Your accounts and setup"
        title="Account"
        action={
          // A `<Link>`, not a button: the sheet's open state is `?sheet=account`,
          // so this stays a real link that works before hydration and can be
          // copied or middle-clicked.
          <Link href="/accounts?sheet=account" className={buttonClass('soft')}>
            <Icon name="plus" size={17} />
            Add account
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
          <ul className="tk-card tk-list divide-hairline flex flex-col divide-y">
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

        <p className="tk-caption mt-3">
          Balances include transfers in both directions. Moving money between your own accounts is
          neither income nor expense.
        </p>
      </section>

      <section>
        <h2 className="tk-section mb-3">Plan and organise</h2>
        <div className="tk-card tk-list divide-hairline flex flex-col divide-y">
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

      {/* The create form is a sheet, opened by the header's "Add account", so
          the screen above is the balances the user came for. */}
      <AccountForm />
    </div>
  )
}
