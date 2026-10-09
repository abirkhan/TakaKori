'use client'

import { useEffect, useRef } from 'react'
import { notifySuccess } from '@/components/app/Toast'
import { QUEUED_SUCCESS } from '@/lib/client/useWriteAction'

/**
 * Announce a write's success once, wherever that write happens.
 *
 * **This exists because four surfaces were silent.** `WriteForm`, the two transaction
 * sheets, `ConfirmDeleteSheet` and the correction form each raised their own toast; the
 * category and account forms raised none. A user adding or removing a category got no
 * confirmation at all — the row appeared or vanished and nothing said why, which is the
 * same class of problem as a write reporting success when it had failed.
 *
 * **Identity is `(attempt, success)`, not the message.** Two categories added in a row
 * return the same string, so guarding on the message alone fires once and then silently
 * stops — the identical defect `useWriteInvalidation` had, fixed there and worth not
 * reintroducing here. `attempt` is the counter `useWriteAction` increments on every
 * submission, so it moves exactly when a new write landed.
 *
 * Queued writes get ADR-043's wording rather than a bare success: the entry is saved on
 * this device, not saved, and IndexedDB cannot promise more than that.
 */
export function useWriteToast(
  state: { success?: string; queued?: boolean },
  attempt: number,
  message: string,
  queuedMessage: string = QUEUED_SUCCESS,
): void {
  const announced = useRef<string | null>(null)

  useEffect(() => {
    // Cleared rather than left, so the same message later is a new announcement and not
    // a suppressed repeat.
    if (state.success === undefined) {
      announced.current = null
      return
    }

    const key = `${attempt}:${state.success}`
    if (announced.current === key) return
    announced.current = key

    notifySuccess(state.queued ? queuedMessage : message)
  }, [state.success, state.queued, attempt, message, queuedMessage])
}