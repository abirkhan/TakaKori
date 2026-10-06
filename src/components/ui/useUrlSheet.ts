'use client'

import { useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * A sheet's open state, held in the URL as `?sheet=<name>`.
 *
 * Why the URL and not React state:
 *
 *   - **The trigger can be a `<Link>`.** The tab bar's floating action is a real
 *     link that works with no client JavaScript, can be copied, and can be
 *     middle-clicked. A button calling `setState` gives all of that up.
 *   - **The back button closes the sheet**, which is what a user pressing back
 *     on a modal expects and what almost no hand-rolled modal gets right.
 *   - **There is only one source of truth**, so the sheet cannot end up visually
 *     open while its state says closed — or closed with the URL still claiming
 *     it is open, which is what a refresh then reproduces.
 *
 * Closing *replaces* rather than pushes, so dismissing a sheet does not leave a
 * history entry to press back through a second time.
 *
 * `close` is memoised because callers put it in effect dependency lists, and a
 * new function identity every render would re-run those effects every render.
 */
export function useUrlSheet(name: string): { open: boolean; close: () => void } {
  const router = useRouter()
  const params = useSearchParams()

  const open = params.get('sheet') === name

  const close = useCallback(() => {
    const next = new URLSearchParams(params.toString())
    next.delete('sheet')
    const qs = next.toString()
    // `window` is safe here: `close` only ever runs from a user interaction, and
    // `router.replace` with a bare `?` would leave a dangling query on the path.
    const path = window.location.pathname
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false })
  }, [params, router])

  return { open, close }
}
