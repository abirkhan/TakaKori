import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayIn } from '@/lib/dates'
import { formatMinor } from '@/lib/money'
import { listCategories } from '@/lib/queries/reference'
import { listBudgetsWithProgress } from '@/lib/queries/planning'
import { BudgetForm } from '@/components/budgets/BudgetForm'
import { BudgetCard } from '@/components/budgets/BudgetCard'

export default async function BudgetsPage() {
  const { userId } = await requireUser()

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
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Budgets</h1>
        <p className="text-sm text-neutral-500">
          Monthly limits for {today.slice(0, 7)}. Pace is projected from your daily
          spending so far.
        </p>
      </div>

      <section className="rounded border border-neutral-200 p-4">
        <BudgetForm categories={categories} />
      </section>

      {budgets.length === 0 ? (
        <p className="rounded border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No budgets yet. Add one above to start tracking pace.
        </p>
      ) : (
        <section className="flex flex-col gap-4">
          {budgets.map((b) => (
            <BudgetCard
              key={b.id}
              budget={b}
              formatMoney={money}
            />
          ))}
        </section>
      )}
    </div>
  )
}