import type { ReactNode } from 'react'

/**
 * Screen header.
 *
 * One per screen, and it owns the `h1`. Left-aligned at every breakpoint: a
 * centred title reads well for two words and breaks down the moment a title is
 * long enough to wrap, which "Recurring transactions" is.
 *
 * `action` sits on the same baseline as the title rather than in its own row, so
 * a page header costs one row of height rather than two.
 */
export function PageHeader({
  title,
  eyebrow,
  action,
  children,
}: {
  title: ReactNode
  eyebrow?: ReactNode
  action?: ReactNode
  /** Sub-heading under the title: a date range, a count, a caveat. */
  children?: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="tk-eyebrow mb-1">{eyebrow}</p>}
        <h1 className="tk-title">{title}</h1>
        {children && <div className="tk-caption mt-1.5">{children}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2 pt-0.5">{action}</div>}
    </header>
  )
}
