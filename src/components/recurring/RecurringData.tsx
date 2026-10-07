'use client'

import { todayIn } from '@/lib/dates'
import { formatMinor } from '@/lib/money'
import {
  getProfile,
  listAccounts,
  listCategories,
  listRecurring,
  toRecurringView,
} from '@/lib/queries/client'
import { useQuery } from '@/lib/client/useQuery'
import { keys } from '@/lib/client/invalidations'
import { RecurringForm } from '@/components/recurring/RecurringForm'
import { RecurringCard } from '@/components/recurring/RecurringCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Alert } from '@/components/ui/Alert'

/**
 * Recurring transactions, loaded in the browser.
 *
 * **Two phases, and the profile genuinely has to come first.** A rule's due list
 * is `toRecurringView(row, today)`, and `today` is today *in the user's timezone*
 * (ADR-006). A rule that fires on the 1st is due in Dhaka and not due in London
 * for eight hours. So the key for the rules read cannot be built until the profile
 * has landed, and until then there is no query — rather than one under a
 * placeholder key that a second timezone would have to share.
 *
 * `accounts` and `categories` are reference lists and are not timezone-scoped, so
 * they start immediately and arrive first. The create form needs them and does not
 * need the profile, which is why it appears before the rules do.
 *
 * **`toRecurringView` stays in JavaScript deliberately.** It is *prediction* —
 * "when is this rule next due" — not aggregation. ADR-004 keeps money arithmetic
 * in SQL; a schedule walk is neither, and duplicating it in SQL would make the
 * date arithmetic live in two places. The database is still the only thing that
 * decides what a rule actually produced, and posting goes through the RPC.
 */
export function RecurringData() {
  const profile = useQuery(keys.profile(), () => getProfile())
  const timezone = profile.data?.timezone

  const today = timezone ? todayIn(timezone) : null

  const rules = useQuery(today ? keys.recurring(`list:${today}`) : null, () =>
    listRecurring().then((rows) => rows.map((r) => toRecurringView(r, today as string))),
  )

  const accounts = useQuery(keys.accounts(), () => listAccounts())
  const categories = useQuery(keys.categories(), () => listCategories())

  const currency = profile.data?.currency ?? 'BDT'
  const money = (minor: number) => formatMinor(minor, { currency })

  const views = rules.data ?? []
  const dueCount = views.reduce((n, v) => n + v.due.length, 0)

  return (
    <>
      <PageHeader
        eyebrow={rules.data ? `${views.length} rule${views.length === 1 ? '' : 's'}` : ' '}
        title="Recurring"
      >
        Nothing is added automatically. When a payment is due, post it yourself — that keeps your
        records a record of what actually happened.
      </PageHeader>

      {dueCount > 0 && (
        <Alert tone="warning">
          {dueCount} occurrence{dueCount === 1 ? '' : 's'} due to post.
        </Alert>
      )}

      {accounts.data && categories.data && today && (
        <section className="tk-card">
          <RecurringForm accounts={accounts.data} categories={categories.data} today={today} />
        </section>
      )}

      {rules.error && (
        <EmptyState
          icon="alert"
          title="Could not load your recurring rules"
          description={rules.error}
        />
      )}

      {!rules.error && !rules.data && (
        <div className="tk-card" aria-busy="true">
          <span className="tk-caption">Loading your recurring rules…</span>
        </div>
      )}

      {views.length === 0 && rules.data && (
        <EmptyState
          icon="repeat"
          title="No recurring rules yet"
          description="Add one for salary, rent or a regular bill, and it will predict when each is due."
        />
      )}

      {views.length > 0 && (
        <section className="flex flex-col gap-4">
          {views.map((v) => (
            <RecurringCard key={v.id} rule={v} formatMoney={money} />
          ))}
        </section>
      )}

      {/* Postings are money, so this one carries provenance. Posting an occurrence
          clears `recurring:` as well as every figure read (see `WRITES.occurrence`),
          because it moves the watermark that decides what is shown as due. */}
      {rules.stale && rules.at !== null && (
        <p className="tk-caption" role="status">
          Last synced {new Date(rules.at).toLocaleTimeString()}.
        </p>
      )}
    </>
  )
}
