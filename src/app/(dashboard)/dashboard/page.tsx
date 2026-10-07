import { RowLink } from '@/components/ui/Row'
import {
  AccountsList,
  DashboardHeader,
  DashboardSummary,
  RecentTransactions,
} from '@/components/dashboard/DashboardData'

/**
 * Dashboard.
 *
 * **The screen where server rendering and client data meet, and the one the
 * other five are being modelled on.**
 *
 * This file stays a Server Component. Everything that does not depend on the
 * user's profile — the section headings, the "See all" link, the four
 * destination links, and the grid itself — is prerendered at build time and
 * arrives as HTML. Only the figures are deferred, into `DashboardData`.
 *
 * Marking this page `'use client'` wholesale would work and would be worse. It
 * would forfeit prerendering for the whole subtree and put the screen's headings
 * and every destination link behind a bundle download — on a metered connection,
 * to show one balance.
 *
 * `grid-cols-1` is load-bearing rather than a default, and the comment explaining
 * why lived here before this split: with no explicit column definition the
 * implicit track is `auto`, floored at its content's min-content width, and a
 * transaction row's min-content is ~430px. On a 390px phone that made the whole
 * page 459px wide and scrollable sideways. `minmax(0, 1fr)` lets the track
 * shrink below its content, which is what makes the truncation inside the rows
 * work (ADR-029).
 */
export default function DashboardPage() {
  return (
    <div className="tk-stack">
      <DashboardHeader />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="tk-stack">
          <DashboardSummary />
          <RecentTransactions />
        </div>

        <div className="tk-stack">
          <AccountsList />

          {/* Everything that is not a top-level tab still needs a home, and "set
              something up" belongs in one place rather than in a header menu.
              Fully static, so it stays here rather than moving client-side. */}
          <section>
            <h2 className="tk-section mb-3">Plan</h2>
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
        </div>
      </div>
    </div>
  )
}
