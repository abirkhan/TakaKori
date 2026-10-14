'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { errorSummary, reportError } from '@/lib/report-error'
import { Icon } from '@/components/ui/Icon'
import { buttonClass } from '@/components/ui/button'

/**
 * The shared body of every error boundary in the app.
 *
 * **One component, three boundaries.** `error.tsx` at the root, in `(auth)` and in
 * `(dashboard)`. `global-error.tsx` is the fourth and shares nothing but its copy —
 * see that file for why it cannot use this one.
 *
 * The copy is the part that must not drift: two boundaries saying different things
 * about the same failure is worse than one saying nothing, because the user cannot
 * tell which screen is broken. `errorSummary` lives in `lib/report-error.ts` for
 * the same reason, and is unit-tested.
 *
 * **The primary action is a retry, and it is `retry` not a link.** `retry()`
 * re-fetches and re-renders the segment that failed, which is the only one of the
 * two options that can actually fix a transient failure — navigating away instead
 * would throw away the page the user was on and whatever they had typed into it.
 * Next 16.3 made this prop stable (it was `unstable_retry` in 16.2), so this is not
 * pinned to a prerelease API.
 *
 * **A second way out sits underneath**, because retry is the right answer usually
 * and a dead end when it is not: a screen that crashed once may crash again on the
 * same data. Where it goes is the caller's decision — see below.
 *
 * **`role="alert"` rather than a live region.** This replaces content that was
 * already on screen, so it is not an addition to be announced politely — it is an
 * interruption, and the one thing a person mid-transaction needs to hear.
 *
 * ### The way out is per-boundary, and that is not a detail
 *
 * The secondary link is a prop rather than a constant because "the dashboard" is
 * only a way out from somewhere. Driving the auth boundary proved it: a signed-out
 * user on a crashed `/login` was offered "Go to the dashboard", which
 * `requireUser()` immediately redirects back to `/login` — a link that leads
 * exactly where they already are, on the one screen where being stuck is most
 * likely. So the authenticated boundaries get the dashboard and the auth one gets
 * sign-in, and the caller has to decide rather than inherit.
 */
export function ErrorScreen({
  error,
  retry,
  /** Which segment failed. Reported, never shown — a URL is not user-facing copy. */
  context,
  /** Where the secondary link goes. Signed-out boundaries must not point at /dashboard. */
  homeHref,
  homeLabel,
}: {
  error: Error & { digest?: string }
  retry: () => void
  context: string
  homeHref: string
  homeLabel: string
}) {
  useEffect(() => {
    reportError(error, context)
  }, [error, context])

  const summary = errorSummary(error)

  return (
    <main className="tk-shell flex min-h-[60dvh] flex-col justify-center py-10">
      <section className="tk-card" role="alert">
        <span className="tk-tile tk-tone-amber">
          <Icon name="alert" size={20} />
        </span>

        <h1 className="tk-title mt-4 text-2xl">{summary.title}</h1>

        <p className="tk-body text-muted mt-2">{summary.description}</p>

        {/*
         * The reference code, and only for a server error.
         *
         * **This is the one piece of technical detail the app ever shows a user**,
         * and it earns its place: the browser only receives a digest for a
         * Server Component error, and without quoting it a bug report is
         * "something broke", which cannot be matched to a log line. It is not
         * short, so it is a code element at caption size rather than anything
         * styled as a heading.
         */}
        {error.digest && (
          <p className="tk-caption mt-3">
            Reference code: <code className="font-mono">{error.digest}</code>
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => retry()} className={buttonClass('primary')}>
            Try again
          </button>
          <Link href={homeHref} className="tk-link">
            {homeLabel}
          </Link>
        </div>
      </section>
    </main>
  )
}
