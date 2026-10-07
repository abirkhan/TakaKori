'use client'

import { todayIn, monthLabel } from '@/lib/dates'
import { formatMinor } from '@/lib/money'
import { getProfile, listBudgetsWithProgress, listCategories } from '@/lib/queries/client'
import { useQuery } from '@/lib/client/useQuery'
import { keys } from '@/lib/client/invalidations'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { BudgetForm } from '@/components/budgets/BudgetForm'
import { BudgetCard } from '@/components/budgets/BudgetCard'

/**
 * Budgets, loaded in the browser.
 *
 * **Three phases, not one, and the order is forced by what each needs.**
 *
 * The profile comes first because every figure here is formatted in the user's
 * currency. Then the categories, which only the create form needs. Then the
 * budgets themselves, which are scoped to *today in the user's timezone* — a
 * budget's month-to-date spend is different depending on where the user is, so
 * the range cannot be chosen until the profile has landed (ADR-006).
 *
 * That is why the first paint is an empty state and not a wrong number. A
 * ৳0 spent against a real limit and a figure that has not arrived look
 * identical, and only one of them is true.
 */
export function BudgetData() {
  const profile = useQuery(keys.profile(), () => getProfile())
  const timezone = profile.data?.timezone

  // `keys.budgets` takes today rather than a raw date, because "progress" is
  // only meaningful relative to a day. Before the profile lands there is no
  // today, so there is no query — and no cache entry written under a key that a
  // different timezone would have to share. `useQuery` takes no `deps` argument
  // on purpose: the timezone is inside the key, so it cannot be forgotten.
  const today = timezone ? todayIn(timezone) : null
  const budgets = useQuery(
    today ? keys.budgets(`progress:${today}`) : null,
    () => listBudgetsWithProgress(today as string),
  )

  const categories = useQuery(keys.categories(), () => listCategories())

  const currency = profile.data?.currency ?? 'BDT'
  const money = (minor: number) => formatMinor(minor, { currency })
  const ready = profile.data !== null && budgets.data !== null

  return (
    <>
      <PageHeader
        // A space rather than a dash: the eyebrow sits directly under the status
        // bar, and a visible placeholder there reads as a loading failure on a
        // screen whose whole job is to look calm.
        eyebrow={today ? monthLabel(today) : ' '}
        title="Budgets"
      >
        Pace is projected from your daily spending so far, so it is a forecast rather than a
        restatement of the limit.
      </PageHeader>

      {categories.data && (
        <section className="tk-card">
          <BudgetForm categories={categories.data} />
        </section>
      )}

      {budgets.error && (
        <EmptyState
          icon="alert"
          title="Could not load your budgets"
          description={budgets.error}
        />
      )}

      {!budgets.error && !ready && (
        <div className="tk-card" aria-busy="true">
          <span className="tk-caption">Loading your budgets…</span>
        </div>
      )}

      {budgets.data?.length === 0 && (
        <EmptyState
          icon="target"
          title="No budgets yet"
          description="Set a monthly limit and this screen will tell you where the month is heading."
        />
      )}

      {budgets.data && budgets.data.length > 0 && (
        <section className="flex flex-col gap-4">
          {budgets.data.map((b) => (
            <BudgetCard key={b.id} budget={b} formatMoney={money} />
          ))}
        </section>
      )}

      {/* The cache holds the last value the *database* produced — every aggregate
          here is a SQL view that cannot run offline (ADR-004). Saying when that
          was is the difference between a stale figure and a wrong one. */}
      {budgets.stale && budgets.at !== null && (
        <p className="tk-caption" role="status">
          Last synced {new Date(budgets.at).toLocaleTimeString()}.
        </p>
      )}
    </>
  )
}
