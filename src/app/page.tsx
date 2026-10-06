import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Logo } from '@/components/ui/Logo'
import { RowLink } from '@/components/ui/Row'
import { Icon } from '@/components/ui/Icon'
import { formatMinor } from '@/lib/money'

/**
 * The public landing page.
 *
 * Also the app's sign-in redirect target for an unauthenticated visitor, so the
 * first thing a new user sees has to make one promise and one offer: your money
 * is legible, and signing up is free.
 */
export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="relative min-h-dvh">
      <div className="tk-wash h-[34rem]" aria-hidden="true" />

      <div className="tk-shell relative flex min-h-dvh flex-col">
        <header className="flex items-center justify-between py-5">
          <Logo size={34} />
          {!user && (
            <Link href="/login" className="tk-btn tk-btn-soft tk-btn-sm">
              Sign in
            </Link>
          )}
        </header>

        <main className="flex flex-1 flex-col justify-center gap-8 py-10">
          <div className="max-w-md">
            <p className="tk-eyebrow">Built for Bangladesh</p>
            <h1 className="mt-2 text-[2.125rem] leading-[1.1] font-semibold tracking-[-0.03em]">
              Know where every taka went.
            </h1>
            <p className="tk-body text-muted mt-3">
              TakaKori records income, spending and transfers across cash, bank and mobile wallets,
              and tells you which ones you actually spend from.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={user ? '/dashboard' : '/signup'} className="tk-btn tk-btn-primary">
              {user ? 'Open TakaKori' : 'Create your account'}
              <Icon name="chevronRight" size={16} />
            </Link>
            {!user && (
              <Link href="/login" className="tk-btn tk-btn-quiet">
                I already have one
              </Link>
            )}
          </div>

          {/* One card, three rows. Rows carry their own 20px inset so the content lines
              up with every card in the app while the dividers between them run
              edge to edge. */}
          <div className="tk-card tk-list divide-hairline flex flex-col divide-y">
            <RowLink
              href="/reports"
              icon="chart"
              tone="sky"
              title="See where it goes"
              subtitle="Trends by month, category and account"
            />
            <RowLink
              href="/budgets"
              icon="target"
              tone="amber"
              title="Set a limit, watch the pace"
              subtitle="A forecast for month end, not a spent figure"
            />
            <RowLink
              href="/recurring"
              icon="repeat"
              tone="violet"
              title="Catch rent and subscriptions"
              subtitle="Predicted dates, posted by you"
            />
          </div>

          <p className="tk-caption max-w-md">
            Figures are stored as exact decimals and formatted as {formatMinor(12500000)} — lakh
            grouping, Latin digits, no rounding surprises.
          </p>
        </main>

        <footer className="border-hairline border-t py-5">
          <p className="tk-caption">
            TakaKori · Income and expense tracking for Dhaka, and everywhere else.
          </p>
        </footer>
      </div>
    </div>
  )
}
