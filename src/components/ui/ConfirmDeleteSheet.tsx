'use client'

import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { buttonClass } from './button'

/**
 * A destructive confirmation.
 *
 * Delete stays a plain `<form action={serverAction}>`, so it still works with
 * JavaScript unavailable. What this adds is the confirmation step:
 * `deleteTransactionAction` is irreversible, and a single mis-tap on a row of
 * financial records should not be one mis-tap.
 *
 * The copy states what is lost. "Are you sure?" reports the app's uncertainty;
 * "This cannot be undone" tells the user what will happen.
 */
export function ConfirmDeleteSheet({
  open,
  onClose,
  title,
  description,
  action,
  hidden,
  confirmLabel = 'Delete',
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  /** A Server Action. Kept as a form so no client JS is required to delete. */
  action: (formData: FormData) => void
  /** Row identity, posted with the delete. */
  hidden?: Record<string, string>
  confirmLabel?: string
  /** Extra context, e.g. the record's own amount. */
  children?: ReactNode
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <form action={action} className="contents">
          {Object.entries(hidden ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <button type="button" onClick={onClose} className={buttonClass('quiet')}>
            Cancel
          </button>
          <button type="submit" className={buttonClass('danger')}>
            {confirmLabel}
          </button>
        </form>
      }
    >
      {children}
    </Modal>
  )
}
