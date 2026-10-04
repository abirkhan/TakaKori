import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/**
 * List row.
 *
 * The workhorse of this interface: a 60px-tall tappable row with a rounded
 * icon tile, a title, a secondary line and a trailing slot. Transactions,
 * accounts, budgets, categories and settings lists are all this component with
 * different contents, which is what keeps six screens looking like one product.
 *
 * `subtitle` is where a date or a category goes, and it must be the second
 * line: on a phone the eye reads tile → title → amount, and anything that
 * competes with the title for that second line loses.
 */
export function Row({
  icon,
  tone = 'brand',
  title,
  subtitle,
  trailing,
  showChevron,
  titleAttribute,
  children,
  className = '',
}: {
  icon?: IconName
  tone?: 'brand' | 'sky' | 'amber' | 'rose' | 'violet' | 'teal'
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  /**
   * Renders a trailing chevron.
   *
   * The chevron is decorative and carries no accessible text: the row's own
   * title is the link name, so a second label here would make screen readers
   * announce "Budgets, Budgets". Pass nothing when the row does not navigate.
   */
  showChevron?: boolean
  /**
   * Stable hook for tests and for a row that repeats its title elsewhere.
   *
   * A transaction row renders its description a second time inside the edit
   * form, so a test that identifies a row by "text containing X" counts it
   * twice. A dedicated attribute gives one unambiguous target per row. Emitted
   * only when passed, so it never appears as noise in the DOM elsewhere.
   */
  titleAttribute?: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={`tk-row ${className}`}>
      {icon && (
        <span className={`tk-tile tk-tone-${tone}`}>
          <Icon name={icon} size={18} />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="tk-body truncate font-medium" data-row-title={titleAttribute}>
          {title}
        </p>
        {subtitle && <p className="tk-caption mt-0.5 truncate">{subtitle}</p>}
        {children}
      </div>

      {trailing && (
        <div className="shrink-0 text-right" data-row-trailing>
          {trailing}
        </div>
      )}
      {showChevron && (
        <span className="text-subtle shrink-0" aria-hidden="true">
          <Icon name="chevronRight" size={18} />
        </span>
      )}
    </div>
  )
}

/**
 * A row that navigates.
 *
 * The whole row is the link, not the title text: a 15px-tap target is unusable
 * on a phone.
 *
 * The link's accessible name comes from the row's own text, so there is no
 * `aria-label` to keep in sync with it. Where that text would be ambiguous —
 * a row whose title is a category name that is also the name of its filter —
 * pass a distinct `linkLabel` rather than hoping the reader infers it.
 */
export function RowLink({
  href,
  icon,
  tone = 'brand',
  title,
  subtitle,
  trailing,
  linkLabel,
  titleAttribute,
}: {
  href: string
  icon?: IconName
  tone?: 'brand' | 'sky' | 'amber' | 'rose' | 'violet' | 'teal'
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  /** Overrides the link's accessible name. Rarely needed. */
  linkLabel?: string
  titleAttribute?: string
}) {
  return (
    <Link
      href={href}
      aria-label={linkLabel}
      className="tk-row rounded-field -mx-1 px-1 transition-opacity active:opacity-70"
    >
      <Row
        icon={icon}
        tone={tone}
        title={title}
        subtitle={subtitle}
        trailing={trailing}
        titleAttribute={titleAttribute}
        showChevron
      />
    </Link>
  )
}
