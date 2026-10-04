import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/**
 * A figure with an icon, a label and a value.
 *
 * The order is icon, value, label — value second because it is the reason the
 * tile exists, and a label above a number forces the eye to travel before it
 * starts reading. `tone` picks the icon's categorical hue; the value itself is
 * always `content`, because colouring a *total* implies something about it that
 * a neutral ink does not.
 */
export function StatTile({
  label,
  value,
  icon,
  tone = 'brand',
  hint,
}: {
  label: ReactNode
  value: ReactNode
  icon: IconName
  tone?: 'brand' | 'sky' | 'amber' | 'rose' | 'violet' | 'teal'
  hint?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
      <span className={`tk-tile tk-tone-${tone}`}>
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0">
        <p className="tk-amount-lg break-words">{value}</p>
        {/* Wraps rather than truncating. Three tiles across a 390px screen is
            ~100px each, and a clipped label ("Across all acco…") is worse than
            a two-line one: the abbreviation it produces is not one the user
            wrote. */}
        <p className="tk-caption mt-0.5">{label}</p>
        {hint && <p className="tk-caption mt-1">{hint}</p>}
      </div>
    </div>
  )
}
