'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

/**
 * Modal sheet.
 *
 * Built on the native `<dialog>` element rather than a hand-rolled overlay,
 * because the things a modal has to get right are exactly the things a div
 * forgets:
 *
 *   - **Focus is trapped** and moves into the dialog on open, so a keyboard user
 *     cannot tab behind it into the page they thought they had left.
 *   - **Escape closes it**, natively, with no key handler.
 *   - **The rest of the page becomes inert** — `inert` on everything outside, so
 *     it cannot be reached by pointer, keyboard, or a screen reader's virtual
 *     cursor.
 *   - **It is in the top layer**, above every `z-index` in the app, including the
 *     fixed tab bar.
 *
 * All four are behaviours, not styles, and reimplementing them is how modals end
 * up broken for keyboard users while looking perfect in a screenshot.
 *
 * `onClose` fires for every dismissal path — Escape, the backdrop, the close
 * button — so a caller never has to know which one the user used.
 *
 * Sheet rather than centred dialog on a phone: it comes up from the bottom edge,
 * where the thumb already is, and it gives the form the full width.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  /** Pinned to the bottom of the sheet, outside the scrollable body. */
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  // `<dialog>` fires `cancel` for Escape and `close` for every path. Routing
  // both through one handler means a caller can never end up with the modal
  // visually gone but its state still "open".
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    const handleClose = () => onClose()
    const handleCancel = () => onClose()

    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('cancel', handleCancel)
    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('cancel', handleCancel)
    }
  }, [onClose])

  // Clicking the backdrop. `<dialog>` does not provide this: a click on the
  // element *outside* the dialog's box is dispatched on the dialog itself, so
  // the geometry check is what distinguishes "tapped the dimmed page" from
  // "tapped inside the sheet".
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    const handleClick = (event: MouseEvent) => {
      if (event.target !== dialog) return
      const r = dialog.getBoundingClientRect()
      const outside =
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      if (outside) onClose()
    }

    dialog.addEventListener('click', handleClick)
    return () => dialog.removeEventListener('click', handleClick)
  }, [onClose])

  // Portalled to the end of `body` so the sheet is never clipped by an ancestor
  // with `overflow: hidden` or a stacking context, both of which exist on this
  // app's screens.
  //
  // **Nothing is rendered while closed, on either side.** This used to guard only the
  // server (`typeof document === 'undefined'`), so a closed sheet was absent from the
  // server HTML and present in the client's — a portal whose server markup did not exist.
  // React cannot hydrate that, and reported it as a full-tree mismatch: the "More"
  // dialog in the app bar is mounted closed on every authed screen, so this fired on
  // every screen, on every load. That is React error #418, which had been reproduced
  // here for some time without a cause. The mismatch was never about stale data or the
  // service worker; it was a `<dialog>` in the DOM that should not have been in it.
  //
  // It was also why `e2e/sheets.spec.ts` passed throughout. The suite asserts that a
  // closed sheet is *not painted*, and `dialog:not([open])` is `display: none`, so the
  // element was correctly invisible while still being present. A visual assertion
  // cannot see a node that is hidden.
  //
  // The trade is that a close is now an unmount rather than a `close()` call, so a
  // sheet with an exit animation would lose it. `Modal` has no exit animation — the
  // one it replaced had none either — and a correct first paint is worth more than a
  // transition.
  if (typeof document === 'undefined' || !open) return null

  return createPortal(
    <dialog
      ref={ref}
      className="tk-modal"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      <div className="tk-modal-sheet">
        <header className="tk-modal-head">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="tk-section">
              {title}
            </h2>
            {description && (
              <p id={descId} className="tk-caption mt-1">
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="tk-btn-icon shrink-0"
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="tk-modal-body">{children}</div>

        {footer && <footer className="tk-modal-foot">{footer}</footer>}
      </div>
    </dialog>,
    document.body,
  )
}
