'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from './Icon'

/**
 * Navigation.
 *
 * This is a phone-first product, so the primary navigation is a bottom tab bar
 * with a floating add action, and the top bar is spent on identity and the one
 * action per screen. A seven-item top bar is a desktop layout that happens to
 * fit above a phone screen; it puts every destination one row deep, which on a
 * 390px-wide screen means a scrolling, unreadable header.
 *
 * From `md` up the tabs move into the header and the bar disappears, because a
 * fixed bottom bar on a desktop window is a desktop pattern from 2011 that
 * covers content and cannot be dismissed.
 *
 * Four tabs is a deliberate ceiling: Home, Transactions, Analytics, Account.
 * Everything else — categories, budgets, recurring — is reached from Account,
 * which is the screen whose job is "everything about you and your setup".
 */

interface Tab {
  href: string
  label: string
  icon: IconName
}

const TABS: readonly Tab[] = [
  { href: '/dashboard', label: 'Home', icon: 'home' },
  { href: '/transactions', label: 'Transactions', icon: 'receipt' },
  { href: '/reports', label: 'Analytics', icon: 'chart' },
  { href: '/accounts', label: 'Account', icon: 'user' },
]

/** Reachable from the header once the tabs move out of the bottom bar. */
const SECONDARY: readonly Tab[] = [
  { href: '/categories', label: 'Categories', icon: 'tag' },
  { href: '/budgets', label: 'Budgets', icon: 'target' },
  { href: '/recurring', label: 'Recurring', icon: 'repeat' },
]

export function BottomNav() {
  const pathname = usePathname()

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 md:hidden"
      // Height is declared as a token (see `--nav-height`) so `main`'s clearance
      // can be derived from it rather than guessed. These two numbers drifting
      // apart is what left 113 controls sitting under this bar.
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        height: 'calc(var(--nav-height) + env(safe-area-inset-bottom))',
      }}
    >
      <div className="border-hairline bg-surface/85 flex h-full items-stretch gap-1 border-t px-2 pt-2 pb-1.5 backdrop-blur-xl">
        {TABS.map((tab) => (
          <TabLink key={tab.href} tab={tab} active={isActive(tab.href)} />
        ))}

        {/* The add action floats above the bar's right edge rather than between
            two tabs. Centred, it straddled the boundary between the
            "Transactions" and "Analytics" labels and sat on top of two other
            targets; in the corner it overlaps nothing, and the thumb still
            reaches it because it sits on the side the hand already grips.

            It links rather than opening the sheet directly: the sheet's state
            lives in the URL, so this stays a real link that works without client
            JavaScript and that the back button closes. */}
        <Link
          href="/transactions?sheet=add"
          className="tk-fab -mt-7 shrink-0 self-start"
          style={{ marginRight: '0.375rem' }}
          aria-label="Add a transaction"
        >
          <Icon name="plus" size={24} strokeWidth={2.2} />
        </Link>
      </div>
    </nav>
  )
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <Link
      href={tab.href}
      className="tk-nav-link"
      data-active={active}
      aria-current={active ? 'page' : undefined}
    >
      <span className="tk-nav-dot" />
      <Icon name={tab.icon} size={21} strokeWidth={active ? 2.1 : 1.7} />
      <span>{tab.label}</span>
    </Link>
  )
}

export function HeaderNav() {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
      {[...TABS, ...SECONDARY].map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className="rounded-pill px-3 py-2 text-sm font-medium transition-colors"
          aria-current={isActive(tab.href) ? 'page' : undefined}
          style={{
            color: isActive(tab.href) ? 'var(--accent)' : 'var(--muted)',
            backgroundColor: isActive(tab.href) ? 'var(--accent-soft)' : 'transparent',
          }}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
