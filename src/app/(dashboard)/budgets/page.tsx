import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayIn, monthLabel } from '@/lib/dates'
import { formatMinor } from '@/lib/money'
import { listCategories } from '@/lib/queries/reference'
import { listBudgetsWithProgress } from '@/lib/queries/planning'
import { BudgetForm } from '@/components/budgets/BudgetForm'
import { BudgetCard } from '@/components/budgets/BudgetCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Alert } from '@/components/ui/Alert'

export default async function BudgetsPage({
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

  const [budgets, categories] = await Promise.all([
    listBudgetsWithProgress(today),
    listCategories(),
  ])

  const money = (minor: number) => formatMinor(minor, { currency })

  return (
    <div className="tk-stack">
      <PageHeader eyebrow={monthLabel(today)} title="Budgets">
        Pace is projected from your daily spending so far, so it is a forecast rather than a
        restatement of the limit.
      </PageHeader>

      {error && <Alert tone="error">{error}</Alert>}

      <section className="tk-card">
        <BudgetForm categories={categories} />
      </section>

      {budgets.length === 0 ? (
        <EmptyState
          icon="target"
          title="No budgets yet"
          description="Set a monthly limit and this screen will tell you where the month is heading."
        />
      ) : (
        <section className="flex flex-col gap-4">
          {budgets.map((b) => (
            <BudgetCard key={b.id} budget={b} formatMoney={money} />
          ))}
        </section>
      )}
    </div>
  )
}
