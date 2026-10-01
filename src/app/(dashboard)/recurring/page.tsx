import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayIn } from '@/lib/dates'
import { formatMinor } from '@/lib/money'
import { listRecurring, toRecurringView } from '@/lib/queries/planning'
import { listAccounts, listCategories } from '@/lib/queries/reference'
import { RecurringForm } from '@/components/recurring/RecurringForm'
import { RecurringCard } from '@/components/recurring/RecurringCard'

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
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Recurring</h1>
        <p className="text-sm text-neutral-500">
          Nothing is added automatically. When a payment is due, post it yourself — that keeps your
          records a record of what actually happened.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {dueCount > 0 && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {dueCount} occurrence{dueCount === 1 ? '' : 's'} due to post.
        </p>
      )}

      <section className="rounded border border-neutral-200 p-4">
        <RecurringForm accounts={accounts} categories={categories} today={today} />
      </section>

      {views.length === 0 ? (
        <p className="rounded border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No recurring rules yet. Add one for salary, rent or a regular bill.
        </p>
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
