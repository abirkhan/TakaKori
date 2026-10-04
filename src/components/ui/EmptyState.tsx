import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/**
 * Empty state.
 *
 * A dashed outline, not a card: an empty card with a shadow claims to be
 * content that failed to load, while a dashed outline reads as a slot waiting
 * to be filled. Always say what to do next — "Nothing matches these filters"
 * without the next action is a dead end.
 */
export function EmptyState({
  title,
  description,
  action,
  icon = 'info',
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  icon?: IconName
}) {
  return (
    <div className="tk-empty">
      <span className="tk-tile tk-tone-brand">
        <Icon name={icon} size={18} />
      </span>
      <p className="tk-section">{title}</p>
      {description && <p className="tk-caption max-w-[26ch]">{description}</p>}
      {action}
    </div>
  )
}
