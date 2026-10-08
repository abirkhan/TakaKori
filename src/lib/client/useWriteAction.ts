'use client'

import { useCallback, useEffect, useState } from 'react'
import { useActionState } from 'react'
import { useOffline } from 'next/offline'
import { queueWrite } from './offlineWrites'
import type { QueuedWriteKind } from './outbox'

/**
 * A Server Action whose pending state cannot hang.
 *
 * **The bug, measured rather than imagined.** With the network severed,
 * submitting a transaction left the sheet's button reading "Saving…", disabled
 * indefinitely — no error, no toast, nothing in the outbox, still stuck well past
 * fifteen seconds. Every `useActionState` form in the app behaved this way,
 * including sign-in.
 *
 * **Why `useActionState` cannot be rescued by wrapping the action.** The obvious
 * fix is to wrap the Server Action in something that races it against a timeout
 * and returns an error state when the deadline passes. That was tried, and it does
 * not work, for a reason worth writing down:
 *
 * - When the network is cut, the Server Action's promise **never settles**. It
 *   neither resolves nor rejects — it is not a failure, it is an absence.
 * - A wrapper racing it against a timer *does* resolve on time. Verified: the
 *   deadline fired, the wrapper returned, and React ignored it.
 * - React did not ignore the value for being late. React ignores it because **once
 *   a Server Action has been dispatched, `useActionState` takes its result from the
 *   server round-trip rather than from the promise the action returned.** The same
 *   wrapper returning *immediately* — without dispatching anything — was picked up
 *   and rendered within 530ms. Dispatching is what costs us the return value.
 *
 * So the deadline has to live in the component, not in the action.
 *
 * **Which is why this is a hook and not a wrapper.** It returns the same
 * `(state, dispatch, pending)` triple as `useActionState`, so a call site swaps one
 * line and nothing else. Two differences from stock behaviour:
 *
 * - `pending` is `reactPending && !localError`, so the button comes back the moment
 *   a write is blocked or given up on.
 * - `state` is replaced with an error when either happened, because React will never
 *   produce one — there is no round-trip to produce it from. Every form already
 *   renders `state.error`, so no call site renders anything new.
 *
 * **The words are the careful part**, because the two failures are not the same
 * fact. `BLOCKED_ERROR` was raised before dispatch, so nothing was written and
 * retrying cannot duplicate it — it says so. `TIMEOUT_ERROR` was raised after
 * dispatch, so the write may still land; it says "could not confirm" and tells the
 * user to refresh before trying again, which it did during the session this was
 * written after. For a ledger, an entry appearing twice is worse than one taking an
 * extra moment to acknowledge itself, and only the user can tell the difference.
 */

export interface ActionResult {
  error?: string
  success?: string
  fieldErrors?: Record<string, string>
  /**
   * The write was stored on this device and is waiting for a connection, rather than
   * having been sent. See ADR-043 — the distinction is the difference between "saved"
   * and "saved until this browser discards it".
   */
  queued?: boolean
}

/**
 * Raised when there is no connection and the write has no queueable equivalent.
 *
 * Only for call sites that pass no `queueKind` — sign-in, password reset, and forms
 * not yet moved across. An authentication call cannot be replayed later, so the
 * honest answer is that it did not happen.
 */
export const BLOCKED_ERROR = 'You are offline, so this was not saved. Reconnect and try again.'

/**
 * Raised when the write should have been queued and could not be.
 *
 * Distinct from `BLOCKED_ERROR` on purpose: that one means "not now, try again",
 * and this one means "this device will not keep it" — Safari private mode, or
 * storage full. Neither may be reported as a save.
 */
export const QUEUE_UNAVAILABLE_ERROR =
  'This could not be saved: this browser will not store it while you are offline. Reconnect and try again.'

/**
 * The confirmation for a write that is queued rather than sent.
 *
 * Deliberately not "Saved." The entry is on the device and nowhere else until a
 * connection drains it, and a user who believes it is on the server will not think
 * to open the app again.
 */
export const QUEUED_SUCCESS = 'Saved on this device. It will sync when you are back online.'

/**
 * Raised after dispatch, when the deadline passed.
 *
 * Deliberately does not claim failure. The app stopped listening; it did not prove
 * anything. Saying "did not save" would invite a duplicate entry.
 */
export const TIMEOUT_ERROR =
  'This is taking longer than expected, so we could not confirm it saved. Refresh to check before trying again.'

/**
 * Generous on purpose. Too short and it fires on a merely slow request, turning a
 * healthy write into a false alarm. Too long and the button still feels broken,
 * which is the bug. The offline path never waits this long — it returns at once.
 */
export const DEFAULT_TIMEOUT_MS = 10_000

/**
 * The state a form should render, given React's result and what we decided ourselves.
 *
 * Pure and exported so the decision is testable without mounting a component. The
 * interesting behaviour here is all React timing, which a unit test can only assert
 * by asserting itself.
 *
 * A queued write reports **success**, because from the user's point of view the
 * entry is recorded and the form should close — but with different wording, and with
 * `queued` set so a caller can say so. Folding it into `error` would leave the sheet
 * open over a transaction that is perfectly well queued, which is the confusing
 * version of this.
 */
export function writeOutcome(
  reactState: ActionResult,
  localError: string | null,
  queued = false,
): ActionResult {
  if (localError) return { error: localError }
  if (queued) return { success: QUEUED_SUCCESS, queued: true }
  return reactState
}

export type WriteAction<State extends ActionResult> = (
  previous: State,
  formData: FormData,
) => Promise<State>

/**
 * `useActionState` with a deadline.
 *
 * `[state, dispatch, pending, attempt]` — the same first three `useActionState`
 * returns, so the shape a call site destructures does not change and the diff at
 * each call site is one line. The fourth is a counter that increments on every
 * submission, which exists because of a subtlety this hook creates:
 *
 * **Why `attempt` is needed.** When offline, `dispatch` clears `localError` and
 * immediately sets it again in the same handler. React batches those two updates,
 * so `localError` never observably changes — the state a caller sees is the same
 * object it saw before. An effect watching `state.error` therefore does not
 * re-run, and a form that guards against re-announcing the last result would
 * swallow the second identical failure. The attempt counter is the one thing that
 * reliably differs between two submissions, so it is what a caller can key on.
 *
 * `dispatch` takes the `FormData` and **forwards it untouched**, which is the one
 * thing it must never get wrong. It is still React's own dispatch underneath, so
 * the action receives the real submitted fields; a wrapper that built its own empty
 * `FormData` would silently write a transaction with no amount and no account.
 * Nothing here reads the payload — the offline decision turns on connectivity, not
 * on what was typed.
 */
export function useWriteAction<State extends ActionResult>(
  action: WriteAction<State>,
  initialState: State,
  options: {
    /** Overridable for tests; nothing in the app overrides it. */
    timeoutMs?: number
    /**
     * Which write this is, so it can be **queued** when there is no connection
     * rather than refused.
     *
     * Omitted at a call site that has no queueable equivalent — sign-in, password
     * reset, and every form not yet moved across — and those keep refusing with
     * `BLOCKED_ERROR`, which is correct: an authentication call cannot be replayed
     * later, and pretending otherwise would strand the user on a form that silently
     * does nothing.
     */
    queueKind?: QueuedWriteKind
  } = {},
/**
   * The state is returned as `State & { queued?: boolean }` rather than by adding
   * `queued` to the actions' own `ActionState`.
   *
   * Queueing is a client concern: no Server Action ever sets that flag, because no
   * Server Action runs offline. Widening here keeps it in the module that produces
   * it, instead of adding a field to three server-side interfaces that would then
   * have to explain a flag they can never return.
   */
): [State & { queued?: boolean }, (formData: FormData) => void, boolean, number] {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, queueKind } = options
  const [reactState, formAction, reactPending] = useActionState<State, FormData>(
    action,
    // `Awaited<State>` rather than `State`: React's types ask for it, and for a
    // non-promise state the two are the same thing — but an unresolved generic
    // cannot prove that, so it is asserted rather than widened by changing every
    // call site.
    initialState as Awaited<State>,
  )
  const offline = useOffline()
  const [localError, setLocalError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  /**
   * Set when the write was queued rather than sent.
   *
   * Carried in the state rather than returned separately, because every consumer
   * already reads `state` to decide whether to close, and a fifth tuple element
   * would have meant touching eleven call sites to learn something they can get
   * from the state they already have.
   */
  const [queued, setQueued] = useState(false)

  /**
   * Starts when React goes pending and clears when it settles, so a timer is only
   * ever running for a write that is actually in flight. The callback sets state
   * from a timeout rather than from the effect body, which is what keeps
   * `react-hooks/set-state-in-effect` happy and is honest about when it happens.
   */
  useEffect(() => {
    if (!reactPending) return
    const timer = setTimeout(() => setLocalError(TIMEOUT_ERROR), timeoutMs)
    return () => clearTimeout(timer)
  }, [reactPending, timeoutMs])

  /**
   * `localError` is reset here, in the event handler, rather than in an effect when
   * React settles. Resetting in an effect would be `setState` in an effect body,
   * which the lint rule rightly rejects, and the next submit is the honest moment
   * to clear a message about the last one.
   */
  const dispatch = useCallback(
    async (formData: FormData) => {
      // Before `localError` is touched, and unconditionally: this is what tells a
      // caller that a new submission has begun even when the outcome is the same
      // string as last time.
      setAttempt((n) => n + 1)
      setLocalError(null)
      setQueued(false)

      /**
       * No connection. **Queue it rather than refuse it**, which is the whole point
       * of the outbox: a user recording a 200 taka expense in a lift must not lose
       * the entry, and refusing is losing it with a polite message attached.
       *
       * `queued: true` rides along with the success so the caller can word it
       * honestly. ADR-043: the entry is saved *on this device*, not saved, because
       * IndexedDB can be evicted and a queued write cannot outlive that. Telling the
       * user "saved" would be claiming a durability the app does not have.
       */
      if (offline) {
        if (!queueKind) {
          setLocalError(BLOCKED_ERROR)
          return
        }

        const stored = await queueWrite(queueKind, formData)

        /**
         * Not queued is not a queued write. ADR-043 again: Safari private mode and
         * a full iOS device make the outbox unavailable, and the honest thing is to
         * say the entry was not kept rather than confirm a save that did not happen.
         */
        if (!stored) {
          setLocalError(QUEUE_UNAVAILABLE_ERROR)
          return
        }

        setQueued(true)
        return
      }

      formAction(formData)
    },
    [offline, formAction, queueKind],
  )

  return [
    writeOutcome(reactState, localError, queued) as State,
    dispatch,
    reactPending && !localError,
    attempt,
  ]
}