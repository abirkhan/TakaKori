'use client'

import { ErrorScreen } from '@/components/app/ErrorScreen'

/**
 * The root error boundary.
 *
 * **Where this one actually catches.** `error.tsx` wraps `page.tsx` and everything
 * below it in the same segment, but **not** the `layout.tsx` above it — an error
 * in the root layout escapes to `global-error.tsx`. This boundary is therefore the
 * one for the landing page and any route without a more specific boundary.
 *
 * The three segment boundaries — `(auth)`, `(dashboard)` and this one — exist
 * separately because of what they *keep*. An error in `/transactions` caught here
 * would replace the whole shell: the app bar, the tab bar, the sign-out control.
 * Catching it one segment down keeps the shell, so the user can navigate away
 * without a full reload and without hunting for a way out of a crashed screen.
 *
 * The copy is shared with the other boundaries deliberately — see `ErrorScreen`.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <ErrorScreen
      error={error}
      retry={retry}
      context="root boundary"
      homeHref="/dashboard"
      homeLabel="Go to the dashboard"
    />
  )
}
