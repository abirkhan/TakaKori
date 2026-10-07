'use client'

import { useActionState, useEffect, type ReactNode } from 'react'
import { Modal } from './Modal'
import { buttonClass } from './button'
import { Alert } from './Alert'
import type { ActionState } from '@/actions/transactions'
import { useWriteInvalidation } from '@/lib/client/useWriteInvalidation'
import type { WriteKind } from '@/lib/client/invalidations'

/**
 * A destructive confirmation.
 *
 * Delete stays a plain `<form action={...}>`, so it still works with JavaScript
 * unavailable — which is the case that matters, because it is the one where
 * nothing else in the client data layer runs either. What this adds is the
 * confirmation step: `deleteTransactionAction` is irreversible, and a single
 * mis-tap on a row of financial records should not be one mis-tap.
 *
 * The copy states what is lost. "Are you sure?" reports the app's uncertainty;
 * "This cannot be undone" tells the user what will happen.
 *
 * **The action returns a result rather than redirecting.** Two reasons, both
 * learned the hard way. A redirect is a server→browser navigation and so has
 * nothing to invalidate in a cache that lives in the browser — the row is
 * deleted and the dashboard keeps showing the balance from before it. And the
 * `?error=` parameter those actions used to redirect with was read by *no*
 * component in this app, so a failed delete silently returned the user to a
 * clean page. Returning the error puts it next to the button, where `role="alert"`
 * announces it.
 */
export function ConfirmDeleteSheet({
  open,
  onClose,
  title,
  description,
  action,
  kind,
  hidden,
  confirmLabel = 'Delete',
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  /** A Server Action with the `(previous, formData) => Promise<ActionState>` shape. */
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>
  /** Which write this is, so the right cached reads are cleared. */
  kind: WriteKind
  /** Row identity, posted with the delete. */
  hidden?: Record<string, string>
  confirmLabel?: string
  /** Extra context, e.g. the record's own amount. */
  children?: ReactNode
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {})

  // Clears the cache at the moment of the write. Without it a deleted
  // transaction leaves its own amount in the total balance until a hard reload.
  useWriteInvalidation(state.success, kind)

  // Close only once the delete has actually succeeded, so a failure leaves the
  // sheet open next to the message explaining why. Calling the prop rather than
  // a local wrapper keeps this free of setState.
  useEffect(() => {
    if (state.success && open) onClose()
  }, [state.success, open, onClose])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <form action={formAction} className="contents">
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
      {state.error && (
        <div className="mt-3">
          <Alert tone="error">{state.error}</Alert>
        </div>
      )}
    </Modal>
  )
}
