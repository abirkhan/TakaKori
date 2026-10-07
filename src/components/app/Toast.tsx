'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'

/**
 * Saying what just happened, briefly.
 *
 * **Every write in this app was silent**, which for a ledger is not terseness but
 * a hazard: a save that fails and a save that lands look identical, so the user's
 * only way to find out is to go looking. This is the one channel that reports it.
 *
 * ### Why it times out at all
 *
 * A confirmation that never leaves is a banner, and a banner on every screen
 * pushes the content the user was reading down the page to make room for a
 * sentence about something that already succeeded. So this disappears — and to
 * stop that from being the failure mode it looks like, **the message is never
 * purely time-dependent**:
 *
 * - it pauses while hovered *or* focused, so resting a thumb or tabbing to the
 *   close button grants unlimited time;
 * - it has a close button, for anyone who would rather not wait;
 * - errors get longer than successes (see `DURATION`), because a lost error is
 *   the exact bug ADR-037 was written to fix — a write that failed and left no
 *   trace.
 *
 * ### Why the live region is permanent and the toast is not
 *
 * A node that appears and is removed at the same instant is announced unreliably;
 * assistive technology has to be observing the region before the text arrives.
 * So an empty container is always mounted and the message is injected into it.
 *
 * ### Why one at a time
 *
 * A stack grows without bound, and a queue would replay stale messages — "Budget
 * saved" long after the user moved on. The answer to "did my last change work?"
 * is about the *last* change, so a new message replaces the one before it.
 *
 * ### A store, not context
 *
 * Same reasoning as `useInstall`. The writes that need reporting are Server
 * Actions invoked from forms, sheets and buttons scattered across five screens,
 * several through portals. A store needs no provider and no call-site wrapping,
 * so a write cannot fail to announce itself because someone forgot to put a
 * component above it.
 */
export type ToastTone = 'success' | 'error'

interface Toast {
  /** Monotonic, so two identical messages are still two distinct states. */
  id: number
  tone: ToastTone
  message: ReactNode
}

/**
 * Success is a receipt and can be short. An error is the only record that the
 * write did *not* happen, so it gets roughly twice as long.
 */
const DURATION: Record<ToastTone, number> = {
  success: 4000,
  error: 8000,
}

/** Matches `tk-toast-out` in globals.css. Duplicated as a number, not a CSS read. */
const EXIT_MS = 150

let current: Toast | null = null
let nextId = 0
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Referentially stable between `emit` calls, which React requires of a
 * `getSnapshot`. Rebuilding it every call would re-render every subscriber on
 * every render, and an unstable snapshot is what React reports as tearing.
 */
function getSnapshot(): Toast | null {
  return current
}

/**
 * Used for the server render and the hydration render after it, so the first
 * client paint matches the server's markup exactly. Always `null`: a message
 * about something that has already happened on this device is not something the
 * server can know.
 */
function getServerSnapshot(): null {
  return null
}

export function notifySuccess(message: ReactNode): void {
  nextId += 1
  current = { id: nextId, tone: 'success', message }
  emit()
}

export function notifyError(message: ReactNode): void {
  nextId += 1
  current = { id: nextId, tone: 'error', message }
  emit()
}

function clear(): void {
  if (current === null) return
  current = null
  emit()
}

/**
 * The current toast, or `null`.
 *
 * `ReactNode` rather than `string` because money has to be tabular: the edit
 * confirmation reads back the amount it saved, and that figure needs
 * `.tk-money` or the digits jitter as they change.
 */
export function useToast(): Toast | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

const TONE_ICON: Record<ToastTone, IconName> = {
  success: 'check',
  error: 'alert',
}

/**
 * The toast region. Mounted once, in the authenticated shell.
 *
 * Renders the container even when there is nothing to say — that is the
 * permanent live region described above, and it is why an always-mounted
 * landmark that announces nothing is the correct shape here.
 */
export function Toaster() {
  const incoming = useToast()
  const [seen, setSeen] = useState<Toast | null>(null)
  const [shown, setShown] = useState<Toast | null>(null)
  const [closing, setClosing] = useState(false)
  const [paused, setPaused] = useState(false)
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Adopting a new message during render rather than in an effect.
   *
   * React's documented pattern for adjusting state when an external value changes,
   * used here because the effect version is wrong in a way
   * `react-hooks/set-state-in-effect` is right to reject: copying the store into
   * local state from an effect leaves the toast a commit behind the store that
   * produced it, so every message appears one render late. Comparing during render
   * keeps the two in step.
   *
   * The pending exit timer is cancelled by the effect below rather than here,
   * because touching a ref during render is its own hazard: `react-hooks/refs`
   * rejects it, and rightly — a render can be thrown away, so a ref written
   * during one may never have happened.
   */
  if (incoming !== null && incoming.id !== seen?.id) {
    setSeen(incoming)
    setShown(incoming)
    setClosing(false)
  }

  /**
   * Cancels a pending exit whenever the message on screen changes.
   *
   * Without this, a new message arriving while the previous one is still fading
   * out would have the predecessor's exit timer fire and yank *it* away mid-read.
   * Keyed on `shown`, so it also runs when the exit completes — where the timer is
   * already spent, and this is a no-op.
   */
  useEffect(() => {
    if (exitTimer.current === null) return
    clearTimeout(exitTimer.current)
    exitTimer.current = null
  }, [shown])

  // Fades out before clearing. The exit animation needs the toast to stay mounted
  // briefly after the store has let go of it; without this the message is pulled
  // out of the DOM mid-flight, which reads as a glitch rather than a finish.
  const close = useCallback(() => {
    setClosing(true)
    exitTimer.current = setTimeout(() => {
      exitTimer.current = null
      clear()
      setShown(null)
      setClosing(false)
    }, EXIT_MS)
  }, [])

  useEffect(
    () => () => {
      if (exitTimer.current !== null) clearTimeout(exitTimer.current)
    },
    [],
  )

  /**
   * The dismissal timer, restarted rather than resumed.
   *
   * On unpause it grants the full duration again rather than tracking a
   * deadline. That is deliberate: a deadline-based timer has to subtract elapsed
   * time correctly across hover, focus, and a tab that was backgrounded for a
   * minute, and every one of those is a chance to end up at zero and vanish
   * early. Being generous cannot produce that bug.
   */
  useEffect(() => {
    if (shown === null || closing || paused) return
    const id = setTimeout(close, DURATION[shown.tone])
    return () => clearTimeout(id)
  }, [shown, closing, paused, close])

  const tone = shown?.tone ?? 'success'

  return (
    <div className="tk-toast-layer" role="status" aria-live="polite">
      {shown && (
        <div
          // `role="alert"` on the message itself, overriding the region's polite
          // default: an error is the one case worth interrupting for.
          role={tone === 'error' ? 'alert' : undefined}
          data-testid="toast"
          data-tone={tone}
          className={`tk-alert tk-toast tk-alert-${tone}${closing ? 'tk-toast-out' : ''}`}
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <Icon name={TONE_ICON[tone]} size={17} className="shrink-0" />
          <span className="min-w-0 flex-1">{shown.message}</span>
          <button type="button" onClick={close} className="tk-toast-close" aria-label="Dismiss">
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
