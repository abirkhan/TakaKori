'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import type { ActionState } from '@/actions/transactions'
import { useWriteAction } from '@/lib/client/useWriteAction'
import { useWriteInvalidation } from '@/lib/client/useWriteInvalidation'
import type { WriteKind } from '@/lib/client/invalidations'
import { Alert } from '@/components/ui/Alert'
import { notifyError, notifySuccess } from '@/components/app/Toast'

/**
 * A form for a write that has to clear the client cache.
 *
 * **This exists because the previous shape could not work.** Four actions
 * (`deleteTransaction`, `deleteBudget`, `deleteRecurring`, `postOccurrence`)
 * returned `void` and redirected with `?error=` on failure, per ADR-020. That is
 * fine for a server-rendered app and broken for this one, for two independent
 * reasons:
 *
 * 1. **A redirect cannot invalidate a browser-side cache.** It is a
 *    server→browser navigation; the paths it revalidates are never re-fetched.
 *    The row is written and the dashboard keeps showing the figure from before
 *    it — ADR-012's bug, reached through a delete rather than an edit.
 * 2. **The `?error=` parameter was read by nobody.** No page in this app takes
 *    `searchParams`. Six redirects were writing a message to a URL that no
 *    component looked at, so a failed delete navigated the user back to a clean
 *    page and said nothing at all. The error was never lost — it was never
 *    displayed.
 *
 * Returning `{ error }` rather than redirecting fixes both: the cache clears at
 * the write, and the message renders next to the button that caused it, where
 * `role="alert"` announces it.
 *
 * `kind` comes from `invalidations.ts` rather than being passed as a prefix list,
 * so no call site can name a partial invalidation and quietly leave a figure
 * stale.
 */
/**
 * What each write says when it lands.
 *
 * Per `kind`, and worded for the *verb the user performed* rather than the entity
 * that changed. "Budget deleted" is the truth about a delete; "Budget saved" would
 * be a lie about it, and this project would rather a confirmation were absent than
 * untrue. The three deleting call sites pass `savedMessage` explicitly, because
 * `kind` alone cannot tell a delete from an edit.
 */
const CONFIRMATION: Record<WriteKind, string> = {
  transaction: 'Transaction saved.',
  occurrence: 'Occurrence posted.',
  account: 'Account saved.',
  category: 'Category saved.',
  budget: 'Budget saved.',
  recurring: 'Recurring rule saved.',
}

export function WriteForm({
  action,
  kind,
  savedMessage,
  className,
  children,
}: {
  /** A Server Action with the `(previous, formData) => Promise<ActionState>` shape. */
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>
  /** Which write this is. Decides what gets invalidated — see `WRITES`. */
  kind: WriteKind
  /**
   * Overrides the wording for writes whose verb `kind` cannot express — the three
   * deletes. Optional because most forms do not need it.
   */
  savedMessage?: string
  className?: string
  children: ReactNode
}) {
  const [state, formAction] = useWriteAction<ActionState>(action, {})

  useWriteInvalidation(state.success, kind)

  /**
   * Success and non-field errors are toast; field errors stay on the form.
   *
   * The split is `state.fieldErrors`, and it is the whole reason. A validation
   * error names a field ("Amount must be greater than zero") and has to persist
   * for as long as it takes to fix it — a toast would leave the user staring at a
   * form that silently rejects their next attempt. An error with no field behind
   * it is a different thing: the write failed for a reason the user cannot fix by
   * editing a field, there is nowhere on the form to put it, and toasting it is
   * the only way it gets said at all. That is the failure ADR-037 describes,
   * where a failed delete returned to a clean page and said nothing.
   *
   * Announced from effects rather than render, because the arrival of a result is
   * an event and render is not. The "already said it" flags are refs, not state:
   * state would mean a `setState` inside these effects, which cascades a render,
   * and `react-hooks/set-state-in-effect` is right to reject it. Without a guard,
   * any unrelated re-render would re-announce the last result forever.
   */
  const announcedSuccess = useRef(false)
  useEffect(() => {
    if (!state.success) return
    if (announcedSuccess.current) return
    announcedSuccess.current = true
    notifySuccess(savedMessage ?? CONFIRMATION[kind])
  }, [state.success, savedMessage, kind])

  const announcedError = useRef(false)
  useEffect(() => {
    if (!state.error) return
    if (state.fieldErrors) return
    if (announcedError.current) return
    announcedError.current = true
    notifyError(state.error)
  }, [state.error, state.fieldErrors])

  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && state.fieldErrors && (
        <div className="mt-2">
          <Alert tone="error">{state.error}</Alert>
        </div>
      )}
    </form>
  )
}