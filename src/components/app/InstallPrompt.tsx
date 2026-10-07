'use client'

import { useState, useSyncExternalStore } from 'react'
import { Icon } from '@/components/ui/Icon'
import { RowButton } from '@/components/ui/Row'
import { buttonClass } from '@/components/ui/button'

/**
 * Getting TakaKori onto someone's home screen.
 *
 * This is the one feature in the app that is mostly *not* ours to build. There
 * are three different platforms, and on two of them the browser decides whether
 * an install is even possible. The job here is to find out which of the three
 * situations we are in and say something true, rather than to render one install
 * button and hope.
 *
 * | Situation                                  | What we can do                        |
 * | ------------------------------------------ | ------------------------------------- |
 * | Already installed                          | Say so, or say nothing. Show no button. |
 * | Chromium, `beforeinstallprompt` captured   | Install in one tap.                   |
 * | Chromium, event never arrived              | Teach the browser-menu route.          |
 * | iOS, any browser                           | Teach the Share-sheet route.          |
 * | Safari on macOS                            | Teach Add to Dock.                    |
 * | Firefox                                    | Nothing. Say nothing.                 |
 *
 * **Why there is no install API on iOS.** No version of iOS fires
 * `beforeinstallprompt` or exposes any equivalent; the only route is the user
 * performing a gesture in the Share sheet. A button that says "Install" on an
 * iPhone can only ever open instructions, so on iOS it says how, rather than
 * pretending.
 *
 * **Why Chromium's button sometimes teaches instead of installing.** Chrome
 * delays `beforeinstallprompt` behind engagement heuristics — the page must be
 * HTTPS, the user must have interacted with it, and they must have spent at
 * least 30 seconds on it. So the event can legitimately never arrive, and
 * DevTools can report the app as installable the whole time. Rendering a live
 * button against an event that may never fire means shipping a dead control, so
 * the fallback is instructions and the button's label changes to match.
 *
 * **Dismissal is permanent**, not per-session. A prompt that reappears is worse
 * than no prompt: it converts a one-time interruption into a recurring tax on
 * opening the app. There is a way back — the row on the Account screen is always
 * there — so nothing is taken away, only the nagging.
 *
 * Two placements, one state. `InstallBanner` interrupts once, and only inside the
 * signed-in shell: asking someone to install an app they have not signed into
 * yet is premature. `InstallRow` is permanent and lives under Account, which is
 * the screen whose stated job is "everything about you and your setup" (ADR-028).
 */

/** Dismissal, persisted. Namespace-prefixed so it cannot collide with anything. */
const DISMISSED_KEY = 'tk.install.dismissed'

type Status =
  /** Server render or first paint. Nothing is known yet, so nothing is said. */
  | 'checking'
  /** Running as an installed app. */
  | 'installed'
  /** `beforeinstallprompt` is captured; one tap installs. */
  | 'available'
  /** Not installed, and the only route is one the user performs by hand. */
  | 'manual'
  /** Not installed, and this browser cannot install at all. */
  | 'unavailable'

type Route = 'ios' | 'safari' | 'chromium' | null

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    // Safari on iOS, and the only signal it exposes. Undefined elsewhere.
    (navigator as { standalone?: boolean }).standalone === true
  )
}

function detectRoute(): Route {
  const ua = navigator.userAgent

  // iPadOS 13+ reports a desktop Safari user agent string while being a touch
  // device, so the string alone calls every iPad a Mac. `maxTouchPoints > 1` is
  // what actually separates them.
  const isIPad =
    /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (isIPad) return 'ios'

  // Firefox cannot install a web app from a manifest at all, so there is no
  // route to teach. Matching on its absence everywhere else is what catches it.
  if (/Firefox|FxiOS/.test(ua)) return null

  if (/^((?!chrome|android|crios).)*safari/i.test(ua)) return 'safari'

  return 'chromium'
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    // Safari in private mode throws on localStorage access rather than returning
    // null. Losing the dismissal for one session is a fine outcome; crashing on
    // mount is not.
    return false
  }
}

interface InstallSnapshot {
  status: Status
  route: Route
  dismissed: boolean
  canInstall: boolean
}

/**
 * The store.
 *
 * These facts live outside React — the browser decides what it supports, and
 * `beforeinstallprompt` arrives minutes after mount on Chromium — so they are
 * held in a module-level store read through `useSyncExternalStore` rather than
 * in `useState` populated by an effect.
 *
 * That is not a stylistic preference. `useState` plus an effect that calls
 * `setState` synchronously is exactly what `react-hooks/set-state-in-effect`
 * exists to reject: the effect body is not an event, so every render re-runs it
 * and cascades. A listener registered once, outside the render cycle, is the
 * shape the rule is steering towards.
 *
 * The store also settles a second problem. `InstallBanner` and `InstallRow` live
 * on different screens and describe one fact; with local state each would run its
 * own detection and hold its own copy of a single-use event.
 */
const SERVER_SNAPSHOT: InstallSnapshot = {
  status: 'checking',
  route: null,
  dismissed: false,
  canInstall: false,
}

const listeners = new Set<() => void>()
let cached: InstallSnapshot | null = null
/** Single-use: Chrome throws if `prompt()` is called twice on one event. */
let capturedEvent: BeforeInstallPromptEvent | null = null
let listening = false

function buildSnapshot(): InstallSnapshot {
  const route = detectRoute()
  const dismissed = readDismissed()

  if (isStandalone()) {
    return { status: 'installed', route, dismissed, canInstall: false }
  }
  if (route === null) {
    return { status: 'unavailable', route, dismissed, canInstall: false }
  }
  // `canInstall` is the whole truth here: it is true only once an event has
  // actually been captured, so a button bound to it cannot be a dead control.
  return {
    status: capturedEvent ? 'available' : 'manual',
    route,
    dismissed,
    canInstall: capturedEvent !== null,
  }
}

/**
 * Cached, because React requires `getSnapshot` to return a referentially stable
 * value between renders. Rebuilding it on every call would also re-read
 * `localStorage` on every render, and an unstable snapshot is what React reports
 * as a tearing bug.
 */
function getSnapshot(): InstallSnapshot {
  cached ??= buildSnapshot()
  return cached
}

/** Invalidate and notify. Every state change in this app funnels through here. */
function emit(): void {
  cached = null
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  if (!listening) {
    listening = true
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault()
      capturedEvent = event as BeforeInstallPromptEvent
      emit()
    })
    window.addEventListener('appinstalled', () => {
      capturedEvent = null
      emit()
    })
  }

  return () => {
    listeners.delete(listener)
  }
}

function dismiss(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // As above: the banner simply returns next session.
  }
  emit()
}

/**
 * Runs the browser's own install dialog.
 *
 * Whether the user accepted or declined, the event is spent — Chrome throws if
 * `prompt()` is called twice — so the snapshot is rebuilt either way. On
 * `accepted`, `appinstalled` has usually already fired and the snapshot reports
 * `installed`, which is what removes both the banner and the row.
 */
async function install(): Promise<void> {
  if (!capturedEvent) return
  await capturedEvent.prompt()
  await capturedEvent.userChoice
  capturedEvent = null
  emit()
}

/**
 * Used during server rendering *and* the hydration render that follows it, so the
 * first client paint matches the server's markup exactly. React re-reads
 * `getSnapshot` immediately afterwards, which is when the real answer arrives.
 */
function getServerSnapshot(): InstallSnapshot {
  return SERVER_SNAPSHOT
}

/** The snapshot, plus the two actions that change it. */
function useInstall(): InstallSnapshot & { dismiss: () => void; install: () => void } {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return { ...snapshot, dismiss, install }
}

/** The hand-performed routes, named for the platform rather than the browser. */
const INSTRUCTIONS: Record<Exclude<Route, null>, { title: string; steps: string[] }> = {
  ios: {
    title: 'Add TakaKori to your home screen',
    steps: ['Tap the Share button in Safari.', 'Choose Add to Home Screen.', 'Tap Add, top right.'],
  },
  safari: {
    title: 'Add TakaKori to your Dock',
    steps: ['Open the File menu in the menu bar.', 'Choose Add to Dock.'],
  },
  chromium: {
    title: 'Add TakaKori to your home screen',
    steps: [
      'Open the browser menu — the three dots, or the icon in the address bar.',
      'Choose Install app, or Install TakaKori.',
    ],
  },
}

/**
 * The one-time prompt, shown inside the signed-in shell.
 *
 * In normal flow between the app bar and the content, so it pushes the page down
 * rather than covering anything. Not `fixed`: the floating action button, the tab
 * bar and the wash gradient are all already fighting for the edges of this
 * screen, and a third fixed element is how ADR-031's 113 controls under the bar
 * happened. A sheet is in the top layer, so it renders above the banner anyway
 * and there is nothing to suppress.
 *
 * Rendered only when the platform has actually offered an install, or on iOS
 * where the route is real but ungated. It renders nothing at all on Firefox and
 * while state is unknown, which is why there is no flash on first paint.
 */
export function InstallBanner() {
  const { status, route, dismissed, dismiss, install, canInstall } = useInstall()

  if (dismissed) return null
  if (status === 'checking' || status === 'installed' || status === 'unavailable') return null

  /**
   * Chromium only, once the browser has actually offered an install.
   *
   * **Not a style choice — it restores the platform's engagement gate.** Chrome
   * delays `beforeinstallprompt` until the page is HTTPS, the user has interacted
   * with it, and they have spent at least 30 seconds on it. That is the
   * mechanism by which "do not nag someone on their first visit" is implemented,
   * and falling back to instructions as soon as `status` is `manual` threw it
   * away: every desktop Chrome visit got a banner immediately, including the
   * first. Waiting for the event means a user who has genuinely spent time with
   * the app sees the ask, and everyone else does not.
   *
   * iOS is deliberately exempt. There is no event and therefore no gate, so
   * waiting for one would mean iOS users are never asked at all — and the gesture
   * is theirs to make whenever they choose.
   */
  if (!canInstall && route !== 'ios') return null

  return (
    <section
      aria-label="Add TakaKori to your home screen"
      className="bg-surface border-hairline relative border-b"
    >
      <div className="tk-shell flex items-center gap-3 py-3">
        <span className="tk-tile tk-tone-brand shrink-0">
          <Icon name="download" size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="tk-body truncate font-medium">Open TakaKori like an app</p>
          <p className="tk-caption truncate">
            {canInstall
              ? 'Full screen, no browser bar, opens straight to your transactions'
              : 'Tap Share, then Add to Home Screen'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {canInstall ? (
            <button
              type="button"
              onClick={() => {
                void install()
                dismiss()
              }}
              className={buttonClass('soft', { size: 'sm' })}
            >
              Install app
            </button>
          ) : (
            <button type="button" onClick={dismiss} className={buttonClass('soft', { size: 'sm' })}>
              How
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className={buttonClass('ghost', { size: 'sm' })}
            aria-label="Not now"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>
    </section>
  )
}

/**
 * The permanent version, on the Account screen.
 *
 * A disclosure rather than a modal: what it opens is three lines of text, not a
 * task, and a sheet for it would put a dialog between a user and the answer to
 * the only question the row raised. State stays out of the URL for the same
 * reason — this is not navigation, and a back button that closes it would make
 * leaving the Account screen ambiguous.
 *
 * The row disappears once the app is installed. A row saying "already done" is
 * clutter, and the user can see for themselves that there is no browser around it.
 */
export function InstallRow() {
  const { status, route, dismissed, dismiss, install, canInstall } = useInstall()
  const [open, setOpen] = useState(false)

  if (status === 'checking' || status === 'installed' || status === 'unavailable') return null

  const instructions = INSTRUCTIONS[route ?? 'chromium']

  return (
    <li>
      {/*
       * `RowButton`, not `<button className="tk-row"><Row /></button>`.
       *
       * The earlier version nested one flex row inside another. The inner row is
       * a flex item, so it inherited `min-width: auto` and refused to shrink
       * below its own min-content; with 40px of doubled padding the row measured
       * 372px and pushed the Account screen sideways on 320px and 360px phones.
       * `layout.spec.ts` caught it. `RowButton` puts `.tk-row` on the button
       * itself — the same arrangement `RowLink` uses, and the rule ADR-029 states.
       */}
      <RowButton
        expanded={open}
        onClick={async () => {
          if (canInstall) {
            await install()
            return
          }
          setOpen((was) => !was)
        }}
        icon="download"
        tone="brand"
        title="Add to home screen"
        subtitle={canInstall ? 'Installs in one tap, from this browser' : instructions.title}
        showChevron={!canInstall}
      />

      {open && (
        <div className="px-5 pb-4">
          <ol className="tk-caption text-content list-decimal space-y-1 pl-4">
            {instructions.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {!dismissed && (
            <button
              type="button"
              onClick={() => {
                dismiss()
                setOpen(false)
              }}
              className={`${buttonClass('ghost', { size: 'sm' })} mt-2`}
            >
              Don&apos;t remind me
            </button>
          )}
        </div>
      )}
    </li>
  )
}
