import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'
import { RowLink } from '@/components/ui/Row'
import { Icon } from '@/components/ui/Icon'
import { AccountForm } from '@/components/accounts/AccountForm'
import { AccountBalances, AccountTotals } from '@/components/accounts/AccountBalances'
import { InstallRow } from '@/components/app/InstallPrompt'
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
 * **The first screen whose data loads in the browser, and the shape the rest of
 * the app should move to.**
 *
 * This file deliberately stays a Server Component. The shell — title, section
 * labels, the four destination links, the create sheet — is still prerendered at
 * build time and still arrives as HTML. Only the figures are deferred, into
 * `AccountBalances`.
 *
 * Marking the page `'use client'` wholesale would work and would be worse. It
 * forfeits prerendering for the whole subtree and puts the heading, the section
 * labels and every destination link behind a bundle download — on a metered
 * connection, to show two numbers. The split keeps the document meaningful while
 * JavaScript is still arriving, which is also what a search crawler and a
 * no-JS reader see.
 *
 * Sections are ordered by how often they are needed — balances, then planning —
 * rather than alphabetically or by an imagined information hierarchy.
 */
export default function AccountsPage() {
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

      {/* Both of these read money, so both must know the currency — which comes
          from the profile, which is itself a network read now. That is the
          two-phase load: profile first, then anything that formats a figure. */}
      <AccountTotals />

      <AccountBalances />

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

          {/* The app itself, in the list of things about your setup. This is the
              permanent half of the install prompt: the banner asks once and can
              be dismissed for good, and this is where it is still reachable
              afterwards. */}
          <InstallRow />
        </div>
      </section>

      {/* The create form is a sheet, opened by the header's "Add account", so
          the screen above is the balances the user came for. */}
      <AccountForm />
    </div>
  )
}
