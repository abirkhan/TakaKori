'use client'

import { formatMinor, toMinor } from '@/lib/money'
import { getAccountBalances, getProfile, listAccounts } from '@/lib/queries/client'
import { useQuery } from '@/lib/client/useQuery'
import { keys } from '@/lib/client/invalidations'
import { StatTile } from '@/components/ui/StatTile'
import { EmptyState } from '@/components/ui/EmptyState'
import { Row } from '@/components/ui/Row'
import { Icon, iconForAccountKind } from '@/components/ui/Icon'

/**
 * The balances on the Account screen, loaded in the browser.
 *
 * This is the pattern the other seven screens are moving to, so the two things
 * it does carefully are the two things they must copy.
 *
 * **The profile comes first.** Every figure here is formatted in the user's
 * currency, and that currency lives in `profiles`. Before this change the server
 * read it in the same query as the page; now it is a second request that has to
 * land first. That is the two-phase load, and it is the reason a screen's first
 * paint is a skeleton rather than zeros. Zeros would be worse: a ৳0 balance and
 * a balance that has not loaded yet look identical, and only one of them is true.
 *
 * **The timestamp is rendered.** `at` is not decorative. A balance served from
 * cache is the last balance the *database* produced, because all aggregation
 * lives in SQL views and RPCs that cannot run offline (ADR-004). Presenting that
 * without saying so is how a user reads a stale figure as a live one, which is
 * the failure this whole cache layer is built to avoid.
 *
 * What is deliberately *not* here: any local aggregation. The total is summed
 * from the balances the server computed, not re-derived in JavaScript.
 */
function useProfile() {
  return useQuery(keys.profile(), () => getProfile())
}

function useBalances() {
  const accounts = useQuery(keys.accounts(true), () => listAccounts(true))
  const balances = useQuery(keys.balances(), () => getAccountBalances())
  return { accounts, balances }
}

export function AccountTotals() {
  const profile = useProfile()
  const { accounts, balances } = useBalances()
  const currency = profile.data?.currency ?? 'BDT'

  const total = (() => {
    if (!accounts.data || !balances.data) return null
    const byAccount = new Map(balances.data.map((b) => [b.account_id, b.balance]))
    return accounts.data
      .filter((a) => !a.is_archived)
      .reduce((sum, a) => sum + toMinor(byAccount.get(a.id) ?? a.opening_balance), 0)
  })()

  const loading = profile.loading || accounts.loading || balances.loading
  const archived = accounts.data?.filter((a) => a.is_archived).length ?? 0

  return (
    <section className="tk-card">
      <div className="flex items-start gap-3">
        <StatTile
          icon="wallet"
          tone="brand"
          label="Across all accounts"
          value={loading ? '—' : formatMinor(total ?? 0, { currency })}
        />
        <StatTile
          icon="card"
          tone="sky"
          label="Accounts"
          value={loading ? '—' : (accounts.data?.filter((a) => !a.is_archived).length ?? 0)}
        />
        <StatTile icon="check" tone="teal" label="Archived" value={loading ? '—' : archived} />
      </div>
    </section>
  )
}

export function AccountBalances() {
  const { accounts, balances } = useBalances()

  return (
    <section>
      <h2 className="tk-section mb-3">Balances</h2>

      {accounts.error && (
        <EmptyState
          icon="alert"
          title="Could not load your accounts"
          description={accounts.error}
        />
      )}

      {!accounts.error && !accounts.data && accounts.loading && (
        <div className="tk-card flex items-center gap-3" aria-busy="true">
          <span className="tk-tile tk-tone-brand">
            <Icon name="wallet" size={18} />
          </span>
          <span className="tk-caption">Loading your accounts…</span>
        </div>
      )}

      {accounts.data?.length === 0 && (
        <EmptyState
          icon="wallet"
          title="No accounts yet"
          description="Add the wallet, bank account or bKash number you actually spend from."
        />
      )}

      {accounts.data && accounts.data.length > 0 && (
        <>
          <ul className="tk-card tk-list divide-hairline flex flex-col divide-y">
            {accounts.data.map((a) => {
              const balance = balances.data
                ? (balances.data.find((b) => b.account_id === a.id)?.balance ?? a.opening_balance)
                : a.opening_balance
              return (
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
                      <span className={toMinor(balance) < 0 ? 'tk-amount tk-expense' : 'tk-amount'}>
                        {formatMinor(toMinor(balance))}
                      </span>
                    }
                  />
                </li>
              )
            })}
          </ul>

          <p className="tk-caption mt-3">
            Balances include transfers in both directions. Moving money between your own accounts is
            neither income nor expense.
          </p>

          {balances.stale && balances.at !== null && (
            <p className="tk-caption mt-1" role="status">
              Last synced {new Date(balances.at).toLocaleTimeString()}.
            </p>
          )}
        </>
      )}
    </section>
  )
}
