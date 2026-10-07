'use client'

import { useActionState, type ReactNode } from 'react'
import type { ActionState } from '@/actions/transactions'
import { useWriteInvalidation } from '@/lib/client/useWriteInvalidation'
import type { WriteKind } from '@/lib/client/invalidations'
import { Alert } from '@/components/ui/Alert'

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
export function WriteForm({
  action,
  kind,
  className,
  children,
}: {
  /** A Server Action with the `(previous, formData) => Promise<ActionState>` shape. */
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>
  /** Which write this is. Decides what gets invalidated — see `WRITES`. */
  kind: WriteKind
  className?: string
  children: ReactNode
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {})

  useWriteInvalidation(state.success, kind)

  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && (
        <div className="mt-2">
          <Alert tone="error">{state.error}</Alert>
        </div>
      )}
    </form>
  )
}
