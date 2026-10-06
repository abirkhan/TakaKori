'use client'

import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { Icon, type IconName } from './Icon'

/**
 * The per-row action sheet.
 *
 * One extra target per row instead of two visible ones. A row that carries its
 * own Edit *and* Delete links is two 44px hitboxes per row, on every row of a
 * fifty-row list, and the link text pushes each row about 40% taller — which is
 * the row-density cost the actions were supposed to be hiding.
 *
 * The two prior shapes were both worse:
 *
 *   - **Visible Edit + Delete links.** Two targets and 40% more height per row,
 *     for actions a user runs once or twice a year. Also a mis-tap risk sitting
 *     in a list of financial records.
 *   - **A `<details>` disclosure.** Same two targets, plus the inline form
 *     reflowed the row it belonged to, so opening it moved everything below it.
 *
 * A single overflow button costs one target per row, keeps the row at its
 * natural height, and puts the destructive action behind two deliberate taps —
 * which is the right friction for something with no undo.
 */
export function RowActionsSheet({
  open,
  onClose,
  title,
  subtitle,
  amount,
  actions,
}: {
  open: boolean
  onClose: () => void
  /** The record's own title, so the sheet says what it is acting on. */
  title: ReactNode
  subtitle?: ReactNode
  /** The record's value, right-aligned. */
  amount?: ReactNode
  actions: readonly {
    label: string
    icon: IconName
    tone?: 'default' | 'danger'
    run: () => void
  }[]
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={subtitle}>
      {/* `contents` so the two buttons are the sheet's only stacked children and
          pick up `.tk-modal-body`'s block rhythm without an extra wrapper. */}
      <div className="flex flex-col gap-2">
        {amount && (
          <div className="tk-card-flat mb-1 text-right" data-row-sheet-amount>
            {amount}
          </div>
        )}

        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.run}
            className={action.tone === 'danger' ? 'tk-action tk-action-danger' : 'tk-action'}
          >
            <Icon name={action.icon} size={18} className="shrink-0" />
            {action.label}
          </button>
        ))}
      </div>
    </Modal>
  )
}
