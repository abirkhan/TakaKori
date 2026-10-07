'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Icon, type IconName } from './Icon'
import { Modal } from './Modal'
import { RowLink } from './Row'
import { buttonClass } from './button'

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

/** Why a destination is on the bar rather than behind the overflow. */
interface Tab {
  href: string
  label: string
  icon: IconName
  /** Shown in the overflow sheet, where there is room to explain. */
  blurb: string
}

/** The four you open to *look at things*. All of them, every day. */
const TABS: readonly Tab[] = [
  { href: '/dashboard', label: 'Home', icon: 'home', blurb: 'What is left, and what is due' },
  {
    href: '/transactions',
    label: 'Transactions',
    icon: 'receipt',
    blurb: 'Everything you have recorded',
  },
  { href: '/reports', label: 'Analytics', icon: 'chart', blurb: 'Where the money went' },
  {
    href: '/accounts',
    label: 'Account',
    icon: 'user',
    blurb: 'Your accounts, and this app’s settings',
  },
]

/**
 * The three you open to *maintain the setup*, ordered by how often that is.
 *
 * **This order is the change.** It was Categories, Budgets, Recurring — flat in
 * the header beside the four above, which is alphabetical rather than an ordering,
 * and treated a screen you check weekly the same as one you tidy twice a year.
 * Now:
 *
 * 1. **Budgets** — a limit is set once and then checked against, often, and "am I
 *    over?" is the reason to open it.
 * 2. **Recurring** — salary and subscriptions; consulted when something looks
 *    wrong or is due to change.
 * 3. **Categories** — the vocabulary, corrected when it stops matching reality.
 *    Rare by design.
 *
 * They live behind one overflow control rather than in the header, so the header
 * carries only what is used daily. That is the "less" half of the brief: seven
 * links in a row is a menu, not navigation, and at 360px it wraps.
 */
const SECONDARY: readonly Tab[] = [
  { href: '/budgets', label: 'Budgets', icon: 'target', blurb: 'Limits, and what is left of each' },
  {
    href: '/recurring',
    label: 'Recurring',
    icon: 'repeat',
    blurb: 'Salary, subscriptions, anything repeating',
  },
  {
    href: '/categories',
    label: 'Categories',
    icon: 'tag',
    blurb: 'The labels you sort spending by',
  },
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

/**
 * The header's navigation: the daily destinations, plus one overflow control.
 *
 * **The overflow trigger shows at every width, including below `md`.** That looks
 * redundant beside a bottom tab bar carrying the same four, and it is the point:
 * on a phone the three setup screens were reachable *only* by scrolling to Account
 * and finding them there, which made the tab bar look like the whole application.
 * One button puts them a tap away without adding a fifth tab — which the four-tab
 * ceiling rules out, and rightly.
 *
 * A `Modal` rather than a dropdown: the focus trap, Escape, the top layer and
 * backdrop inertness come free, which is why every other interruption in this app
 * is one.
 */
export function HeaderNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <>
      <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
        {TABS.map((tab) => (
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

      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass('ghost')}
        aria-label="More sections"
        aria-haspopup="dialog"
      >
        <Icon name="dots" size={20} />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="More"
        description="Set up how TakaKori keeps track of your money."
      >
        {/* One card with dividers, not a stack of cards, and one link per row —
            ADR-029 again, in the place it is easiest to forget. */}
        <ul className="tk-card tk-list divide-hairline flex flex-col divide-y">
          {SECONDARY.map((tab) => (
            <li key={tab.href}>
              <RowLink
                href={tab.href}
                icon={tab.icon}
                title={tab.label}
                subtitle={tab.blurb}
                linkLabel={tab.label}
              />
            </li>
          ))}
        </ul>
      </Modal>
    </>
  )
}
