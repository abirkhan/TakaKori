'use client'

import { ErrorScreen } from '@/components/app/ErrorScreen'

/**
 * The error boundary for the unauthenticated shell.
 *
 * Separate from the dashboard one so a failed sign-in cannot render the tab bar.
 * Those tabs are all `Link`s into `(dashboard)`, and the layout would send the user
 * straight back to `/login` by `requireUser()` — so a crashed login screen showing
 * navigation to five screens that would all bounce them here is worse than showing
 * nothing.
 *
 * **The way out points at `/login`, not the dashboard, and driving this boundary is
 * what showed why.** A shared component defaulted the secondary link to
 * "Go to the dashboard"; on a crashed sign-in page that link leads straight back to
 * the same screen, because the user is not signed in. It is the one place where the
 * obvious default is a loop, so the destination is an argument rather than an
 * inherited constant.
 */
export default function AuthError({
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
      context="auth boundary"
      homeHref="/login"
      homeLabel="Back to sign in"
    />
  )
}
