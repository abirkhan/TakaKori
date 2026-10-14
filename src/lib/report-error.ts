/**
 * Reporting an uncaught error, and deciding what a user is told about it.
 *
 * **This is the seam Sentry gets wired into**, and it exists now rather than when
 * Sentry arrives so that wiring it in is a one-file change rather than a hunt
 * through four route boundaries. Four copies of `console.error` would work exactly
 * as well and would be four copies of the same decision.
 *
 * Kept free of `'use client'` deliberately: this module has no state, no hooks and
 * no components, so it is testable in isolation — and the copy it produces is the
 * part most worth testing, because two boundaries saying different things about one
 * failure is worse than one saying nothing.
 */

/** The `Error` shape Next hands to an error boundary. */
export interface BoundaryError extends Error {
  /** Next's correlation handle. Present only for a Server Component error. */
  digest?: string
}

/**
 * Log an uncaught error.
 *
 * **The digest is passed separately rather than being read off the message**,
 * because it is the only part of a production server error that reaches the
 * browser — the message is replaced with a generic one specifically so server
 * internals do not leak. An error reporter that cannot send the digest cannot be
 * used to find the matching server log line, which is most of what it is for.
 *
 * `console.error`, not `console.warn`: this is a defect, and warn is the level a
 * lint rule or a test treats as noise.
 */
export function reportError(error: BoundaryError, context: string): void {
  if (error.digest) {
    console.error(`[${context}] ${error.message}`, { digest: error.digest, error })
  } else {
    console.error(`[${context}] ${error.message}`, error)
  }
}

/**
 * What a user is told, given what the browser is allowed to know.
 *
 * **There are two genuinely different situations here and they get different
 * words**, because the browser knows different things about each:
 *
 * - **With a digest**: the error came from a Server Component and the real message
 *   never left the server. The words must not imply the app knows what went wrong.
 * - **Without one**: the error came from a Client Component, so the message is real.
 *
 * ### What this deliberately does not say
 *
 * **Not "Nothing was changed."** That reads reassuringly and is not knowable. An
 * error boundary catches a failure to *render*, which can follow a write that
 * succeeded — the transaction is on the server and the screen failed to draw it.
 * Claiming nothing changed would be the ADR-043 mistake in a new place: telling a
 * user their money is safe because a component threw, when the safe answer is the
 * one they can check. This app's whole standard is that a confirmation must never
 * outrun what is known (ADR-012, ADR-043), and an error screen is the worst place
 * to break it, because it is read by someone who is already worried.
 *
 * **Not a guess at the cause.** "There may be a problem with the connection" is
 * speculation: this boundary catches render failures, and a render failure is more
 * often a bug than a network problem. Naming a wrong cause sends someone to check
 * their Wi-Fi instead of reporting a defect.
 *
 * So both cases say only what is true — a screen did not load, here is how to try
 * again — and the server case additionally points at the reference code, which is
 * the one thing that makes a report actionable.
 */
export function errorSummary(error: BoundaryError): {
  title: string
  description: string
} {
  if (error.digest) {
    return {
      title: 'This screen could not load',
      description:
        'Try again, and if it keeps happening, send us the reference code below so we can find it.',
    }
  }
  return {
    title: 'This screen stopped working',
    description: 'Try again. If it keeps happening, tell us what you were doing and we will look.',
  }
}
