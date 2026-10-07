'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/ui/PageHeader'
import { Alert } from '@/components/ui/Alert'

/**
 * The Google OAuth landing page.
 *
 * This was a Route Handler. It is now a page, and that change is the whole
 * point: `@supabase/ssr`'s browser client runs PKCE entirely on the client —
 * `detectSessionInUrl` sees the `?code=`, exchanges it using the verifier it
 * stored on the way out, and writes the session to the cookie the app already
 * reads. No server participates in the exchange, so there is nothing for a
 * server route to do.
 *
 * That removes both Google handlers (`/auth/login/google` and
 * `/auth/callback/google`), and with them ADR-025's hazard: the callback was
 * once built from `request.nextUrl.origin`, which on Netlify is the *deploy*
 * URL, so a deploy preview sent its OAuth callback to production. Supabase
 * accepted it, the flow started, and the session cookie landed on the wrong
 * host — a misconfiguration that looked like success. Now the redirect target is
 * whatever origin the browser is on, so a preview sends its own URL, Supabase
 * compares it to the allowlist, and rejects it **loudly**.
 *
 * **Why this page exists at all, rather than letting `/dashboard` handle it.**
 * `detectSessionInUrl` needs a document that hydrates before it can exchange,
 * and the exchange takes a network round-trip. Rendering that as a blank shell
 * on the dashboard would mean a signed-in user seeing an empty screen for a few
 * hundred milliseconds. Here it means one honest line that says what is
 * happening.
 *
 * **`next` is validated again on arrival**, not just when the flow starts. It
 * travelled through a third party in a query string, and an absolute URL would
 * be an open redirect. Same rule as `GoogleSignIn`: same-site paths only.
 */
function ExchangeAndResume() {
  const router = useRouter()
  const params = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // `getSession()` triggers the code exchange `detectSessionInUrl` started,
    // and resolves once a session exists — or immediately if the URL carried no
    // code, which is the case when someone bookmarks this route.
    let cancelled = false

    createClient()
      .auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (cancelled) return

        if (sessionError || !data.session) {
          setError('Google sign-in did not complete. Try again, or use your email and password.')
          return
        }

        const next = params.get('next')
        const safeNext =
          next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
        router.replace(safeNext)
      })
      .catch(() => {
        if (!cancelled) setError('Google sign-in did not complete. Try again.')
      })

    return () => {
      cancelled = true
    }
  }, [params, router])

  if (error) {
    return (
      <>
        <PageHeader eyebrow="Sign in" title="That did not work" />
        <Alert tone="error">{error}</Alert>
      </>
    )
  }

  return (
    <>
      <PageHeader eyebrow="Sign in" title="Finishing up" />
      {/* No spinner glyph: adding an icon for this would mean drawing a new one
          for a state the user sees for a few hundred milliseconds. The caption
          says the same thing in fewer bytes. */}
      <p className="tk-caption" role="status">
        Confirming with Google…
      </p>
    </>
  )
}

/**
 * Suspense because `useSearchParams` suspends during static rendering. Without
 * it this route becomes dynamic purely to read an optional query parameter.
 */
export default function GoogleCallbackPage() {
  return (
    <div className="tk-shell flex min-h-dvh flex-col justify-center py-10">
      <Suspense fallback={<p className="tk-caption">Finishing up…</p>}>
        <ExchangeAndResume />
      </Suspense>
    </div>
  )
}
