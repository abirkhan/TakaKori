/**
 * The canonical origin of this deployment, used to build every auth redirect
 * URL: email confirmation, password reset, and OAuth callbacks.
 *
 * This exists as its own module because there used to be two sources of truth.
 * The email flows read `NEXT_PUBLIC_SITE_URL`, while the Google OAuth route
 * built its redirect from `request.nextUrl.origin` — the incoming Host header.
 * On Netlify those disagree: the Host header resolves to the deploy URL, so
 * asking for the deploy preview silently produced an OAuth callback pointing at
 * a preview domain instead of production. Supabase then sets the session cookie
 * on the wrong host and drops the user somewhere they did not ask to be.
 *
 * Only the configured value is trusted. `NEXT_PUBLIC_SITE_URL` must exactly
 * match an entry in the Supabase redirect allowlist, because Supabase compares
 * the string rather than resolving it.
 */

/** Trailing slashes are stripped so callers can append `/path` safely. */
function normalise(value: string): string {
  return value.replace(/\/+$/, '')
}

/**
 * The deployment origin, without a trailing slash.
 *
 * Throws in production when unset rather than guessing. A wrong origin does not
 * fail loudly at the point of misconfiguration: Supabase accepts the request,
 * sends the email or starts the OAuth flow, and the user only discovers the
 * problem when the link does nothing. Failing here puts the error where it can
 * be found.
 *
 * In development it falls back to localhost so the app runs with no
 * configuration at all.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return normalise(configured)

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL is not set. Auth redirect URLs would point at the ' +
        'wrong origin and fail silently for the user. Set it to the deployed ' +
        'origin and add it to the Supabase redirect allowlist.',
    )
  }

  return 'http://localhost:3000'
}
