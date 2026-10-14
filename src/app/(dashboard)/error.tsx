'use client'

import { ErrorScreen } from '@/components/app/ErrorScreen'

/**
 * The error boundary for the authenticated shell.
 *
 * **This is the one that matters, because it is where a user loses their work.**
 *
 * Seven screens live under `(dashboard)`, and every figure in this app is a client
 * read that resolves through a cache keyed on the profile's timezone. A failure
 * there is a failed render deep in a data layer — the exact class of bug that
 * produced ADR-012's stale balance and ADR-031's 113 controls under the tab bar.
 *
 * It sits at the segment root rather than per-route for two reasons. A per-route
 * boundary means a new file every time a screen is added, and the next one gets
 * forgotten — so the screens added most recently would be the ones with no
 * boundary. And every screen here fails the same way: a read rejected, a shape
 * the view did not expect. The copy is identical, so a single boundary is honest
 * rather than a shortcut.
 *
 * **Keeping the shell is the point.** This boundary is inside `layout.tsx`, so the
 * app bar, the tab bar, the offline banner and the outbox all still render. The
 * user gets a screen that says what happened with a way to leave it, rather than
 * an unstyled Next.js page with no navigation at all.
 */
export default function DashboardError({
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
      context="dashboard boundary"
      homeHref="/dashboard"
      homeLabel="Go to the dashboard"
    />
  )
}
