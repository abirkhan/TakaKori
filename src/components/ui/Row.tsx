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
 *
 * `RowContents` is separated from the box because `RowLink` needs the same
 * children inside a link, and nesting one `.tk-row` inside another gave the
 * inner flex container `min-width: auto` — it refused to shrink below its own
 * min-content width (306px) and pushed the page sideways on a 320px screen.
 * One flex row per row, not two.
 */

/** The children of a row, without the box. Shared by `Row` and `RowLink`. */
function RowContents({
  icon,
  tone,
  title,
  subtitle,
  trailing,
  showChevron,
  titleAttribute,
  actions,
  children,
}: {
  icon?: IconName
  tone: 'brand' | 'sky' | 'amber' | 'rose' | 'violet' | 'teal'
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  showChevron?: boolean
  titleAttribute?: string
  /**
   * A control for this row's own actions, rendered after the trailing slot.
   *
   * Separate from `trailing` because `trailing` is the *value* — the amount, the
   * balance — and tests locate it by `[data-row-trailing]`. Mixing a button in
   * there would make "read the amount" and "click the menu" the same target.
   */
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <>
      {icon && (
        <span className={`tk-tile tk-tone-${tone}`}>
          <Icon name={icon} size={18} />
        </span>
      )}

      {/* `min-w-0` is what allows the truncating children to actually truncate:
          a flex item defaults to `min-width: auto`, which floors it at the
          longest word rather than letting it shrink. */}
      <div className="min-w-0 flex-1">
        <p className="tk-body truncate font-medium" data-row-title={titleAttribute}>
          {title}
        </p>
        {subtitle && <p className="tk-caption mt-0.5 truncate">{subtitle}</p>}
        {children}
      </div>

      {(trailing || actions) && (
        /*
         * One column, so a row with both a value and an action control spends the
         * same width as a row with only a value.
         *
         * `actions` pulls left by half the row's gap, which lets a 44px tap target
         * sit in what would otherwise be dead space beside the amount. Without it
         * the button cost the title 54px — enough that "2026-10-06 · Food" itself
         * truncated at 390px, losing the date, which is the most useful thing on
         * the line.
         */
        <div className="flex shrink-0 items-center gap-1.5">
          {trailing && (
            <div className="text-right" data-row-trailing>
              {trailing}
            </div>
          )}
          {actions && <div className="-ml-1.5 shrink-0">{actions}</div>}
        </div>
      )}
      {showChevron && (
        <span className="text-subtle shrink-0" aria-hidden="true">
          <Icon name="chevronRight" size={18} />
        </span>
      )}
    </>
  )
}

export function Row(props: {
  icon?: IconName
  tone?: 'brand' | 'sky' | 'amber' | 'rose' | 'violet' | 'teal'
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  /** A control for this row's own actions. See `RowContents`. */
  actions?: ReactNode
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
   * sheet, so a test that identifies a row by "text containing X" counts it
   * twice. A dedicated attribute gives one unambiguous target per row. Emitted
   * only when passed, so it never appears as noise in the DOM elsewhere.
   */
  titleAttribute?: string
  children?: ReactNode
  className?: string
}) {
  const {
    icon,
    tone = 'brand',
    title,
    subtitle,
    trailing,
    actions,
    showChevron,
    titleAttribute,
    children,
    className = '',
  } = props

  return (
    <div className={`tk-row ${className}`}>
      <RowContents
        icon={icon}
        tone={tone}
        title={title}
        subtitle={subtitle}
        trailing={trailing}
        actions={actions}
        showChevron={showChevron}
        titleAttribute={titleAttribute}
      >
        {children}
      </RowContents>
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
      // No `-mx-1 px-1` here. That existed to give a link a full-bleed hit area
      // inside a `p-1` list; the list now has no padding and `.tk-row` carries
      // its own inset, so those utilities only overrode the row's padding —
      // Tailwind's utilities layer beats the components layer — and put the
      // link's content back at the wrong edge.
      className="tk-row transition-opacity active:opacity-70"
    >
      <RowContents
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

/**
 * A row that acts rather than navigates: a disclosure, a toggle, a control.
 *
 * **`RowLink` and this are the same shape, and they must stay that way.** The
 * interactive element carries `.tk-row` itself rather than wrapping a `<Row>`.
 * That is not tidiness — nesting one flex row inside another gives the inner one
 * `min-width: auto`, so it refuses to shrink below its own min-content, and with
 * the doubled 40px of padding the row measured 372px and pushed the whole screen
 * sideways on a 320px phone (ADR-029). The Account screen's install row did
 * exactly this and `layout.spec.ts` caught it.
 *
 * `type="button"` is set unconditionally. A `<button>` inside a form defaults to
 * `submit`, and a row that silently submits the surrounding form is not a
 * disclosure.
 */
export function RowButton({
  onClick,
  expanded,
  controls,
  icon,
  tone = 'brand',
  title,
  subtitle,
  trailing,
  titleAttribute,
  showChevron,
  className = '',
}: {
  onClick: () => void
  /** Renders `aria-expanded`, for a disclosure. Omit when this is not one. */
  expanded?: boolean
  /** The id of the region this row opens, for `aria-controls`. */
  controls?: string
  icon?: IconName
  tone?: 'brand' | 'sky' | 'amber' | 'rose' | 'violet' | 'teal'
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  titleAttribute?: string
  showChevron?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controls}
      className={`tk-row w-full text-left transition-opacity active:opacity-70 ${className}`}
    >
      <RowContents
        icon={icon}
        tone={tone}
        title={title}
        subtitle={subtitle}
        trailing={trailing}
        titleAttribute={titleAttribute}
        showChevron={showChevron}
      />
    </button>
  )
}
