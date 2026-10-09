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
 *
 * **`message` is optional and defaults to the action's own success string.** An action
 * that can end in more than one outcome words each of them — `deleteAccountAction`
 * returns "Account archived", "Account removed" or "Account restored" — and a caller that
 * has to restate them is a caller that will restate one of them wrongly. I did exactly
 * that here: passing a fourth argument in the belief that it was a second success
 * message, when it is the *offline* wording. Archiving announced "Account removed" and
 * restoring announced "Saved on this device". Omitting the argument cannot be got wrong.
 */
/**
 * What to announce for one write.
 *
 * Split out from the hook because the unit suite runs in node with no DOM, so the hook
 * itself cannot be mounted — and this is the part that was wired up wrongly.
 *
 * **The ordering is the contract.** A queued write takes the offline wording whatever
 * else was passed, because "Expense saved" for an entry sitting in IndexedDB is the exact
 * claim ADR-043 forbids. `message` is only ever a rewrite of the action's own wording,
 * and an absent one falls through to that.
 */
export function toastMessage(
  state: { success?: string; queued?: boolean },
  message?: string,
  queuedMessage: string = QUEUED_SUCCESS,
): string {
  if (state.queued) return queuedMessage
  return message ?? state.success ?? ''
}

export function useWriteToast(
  state: { success?: string; queued?: boolean },
  attempt: number,
  message?: string,
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

    // Destructured rather than passing `state`, so the dependency list is the four
    // values the announcement actually depends on.
    notifySuccess(toastMessage({ success: state.success, queued: state.queued }, message, queuedMessage))
  }, [state.success, state.queued, attempt, message, queuedMessage])
}