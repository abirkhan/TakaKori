import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayIn } from '@/lib/dates'
import { formatMinor } from '@/lib/money'
import { listRecurring, toRecurringView } from '@/lib/queries/planning'
import { listAccounts, listCategories } from '@/lib/queries/reference'
import { RecurringForm } from '@/components/recurring/RecurringForm'
import { RecurringCard } from '@/components/recurring/RecurringCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Alert } from '@/components/ui/Alert'

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { userId } = await requireUser()
  const params = await searchParams
  const error = typeof params.error === 'string' ? params.error : null

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone, currency')
    .eq('id', userId)
    .single()

  const timezone = profile?.timezone ?? 'Asia/Dhaka'
  const currency = profile?.currency ?? 'BDT'
  const today = todayIn(timezone)

  const [rules, accounts, categories] = await Promise.all([
    listRecurring(),
    listAccounts(),
    listCategories(),
  ])

  const views = rules.map((r) => toRecurringView(r, today))
  const dueCount = views.reduce((n, v) => n + v.due.length, 0)

  return (
    <div className="tk-stack">
      <PageHeader
        eyebrow={`${rules.length} rule${rules.length === 1 ? '' : 's'}`}
        title="Recurring"
      >
        Nothing is added automatically. When a payment is due, post it yourself — that keeps your
        records a record of what actually happened.
      </PageHeader>

      {error && <Alert tone="error">{error}</Alert>}

      {dueCount > 0 && (
        <Alert tone="warning">
          {dueCount} occurrence{dueCount === 1 ? '' : 's'} due to post.
        </Alert>
      )}

      <section className="tk-card">
        <RecurringForm accounts={accounts} categories={categories} today={today} />
      </section>

      {views.length === 0 ? (
        <EmptyState
          icon="repeat"
          title="No recurring rules yet"
          description="Add one for salary, rent or a regular bill, and it will predict when each is due."
        />
      ) : (
        <section className="flex flex-col gap-4">
          {views.map((v) => (
            <RecurringCard
              key={v.id}
              rule={v}
              formatMoney={(minor) => formatMinor(minor, { currency })}
            />
          ))}
        </section>
      )}
    </div>
  )
}
