'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Modal } from './Modal'
import { buttonClass } from './button'
import { Alert } from './Alert'
import { notifySuccess } from '@/components/app/Toast'
import type { ActionState } from '@/actions/transactions'
import { useWriteAction } from '@/lib/client/useWriteAction'
import { useWriteInvalidation } from '@/lib/client/useWriteInvalidation'
import type { WriteKind } from '@/lib/client/invalidations'
import type { QueuedWriteKind } from '@/lib/client/outbox'

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
  queueKind,
  hidden,
  confirmLabel = 'Delete',
  savedMessage = 'Deleted.',
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
  /**
   * Which write this is, for the outbox — so a delete taken offline is queued
   * rather than refused. Separate from `kind` because there are six cache kinds and
   * ten queued ones, and a pair that disagrees would invalidate the wrong reads.
   *
   * A delete is the safest thing to queue: it carries an id and nothing else, and
   * ADR-042 has a delete whose row has already gone count as success, so a replay
   * converges without anything to reconcile.
   */
  queueKind?: QueuedWriteKind
  /** Row identity, posted with the delete. */
  hidden?: Record<string, string>
  confirmLabel?: string
  /**
   * What to say once the record is gone. Defaults to the truthful minimum;
   * call sites name the record, because "Deleted." leaves the user wondering
   * which of the things they just changed was the one that changed.
   */
  savedMessage?: string
  /** Extra context, e.g. the record's own amount. */
  children?: ReactNode
}) {
  /** `useMemo` because the action is a prop; see the note in `WriteForm`. */
const [state, formAction, , attempt] = useWriteAction<ActionState>(action, {}, { queueKind })

  // Clears the cache at the moment of the write. Without it a deleted
  // transaction leaves its own amount in the total balance until a hard reload.
  // Skipped for a queued delete, because nothing has reached the database yet.
  useWriteInvalidation(state.queued ? undefined : state.success, kind, attempt)

  /**
   * Success toasts; failure does not, and that is not an oversight.
   *
   * This sheet **stays open when the delete fails**, so that the user can read
   * why and try again. A toast is a `z-index: 50` element behind a modal
   * backdrop — while this sheet is open it is simply not on screen. A failure
   * message the user cannot see is exactly the bug ADR-037 exists to prevent, so
   * the error stays inline below, where it is rendered *inside* the sheet.
   *
   * The toast is raised for the same reason the sheet closes: the success toast
   * appears once the sheet is gone, and the announcement is issued a beat before
   * that so assistive technology hears it.
   *
   * Refs for the one-shot guards, not state: `setState` inside an effect cascades
   * a render, which `react-hooks/set-state-in-effect` exists to reject.
   */
  const announced = useRef(false)
  useEffect(() => {
    if (!state.success) return
    if (announced.current) return
    announced.current = true
    notifySuccess(savedMessage)
  }, [state.success, savedMessage])

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