'use client'

import { useCallback, useEffect, useState } from 'react'
import { useActionState } from 'react'
import { useOffline } from 'next/offline'

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
}

/** Raised before dispatch, while offline. Nothing was written. */
export const BLOCKED_ERROR = 'You are offline, so this was not saved. Reconnect and try again.'

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
 * The state a form should render, given React's result and anything we decided
 * ourselves.
 *
 * Pure and exported so the decision is testable without mounting a component. The
 * interesting behaviour here is all React timing, which a unit test can only assert
 * by asserting itself.
 */
export function writeOutcome(reactState: ActionResult, localError: string | null): ActionResult {
  return localError ? { error: localError } : reactState
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
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): [State, (formData: FormData) => void, boolean, number] {
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
    (formData: FormData) => {
      // Before `localError` is touched, and unconditionally: this is what tells a
      // caller that a new submission has begun even when the outcome is the same
      // string as last time.
      setAttempt((n) => n + 1)
      setLocalError(null)

      /**
       * The offline short-circuit, and the reason it is safe: the action is not
       * dispatched at all. Nothing is written, so a retry once the connection is
       * back cannot produce a duplicate, and the user is told why instead of
       * watching a button that will never come back.
       *
       * `offline` is `useOffline()` rather than `navigator.onLine`, for the reason
       * `OfflineBanner` documents: `navigator.onLine` reports the network interface
       * and stays `true` on a phone on a WiFi with no upstream.
       */
      if (offline) {
        setLocalError(BLOCKED_ERROR)
        return
      }

      formAction(formData)
    },
    [offline, formAction],
  )

  return [
    writeOutcome(reactState, localError) as State,
    dispatch,
    reactPending && !localError,
    attempt,
  ]
}