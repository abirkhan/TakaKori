'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { rememberCookieString } from '@/lib/supabase/remember'
import { GoogleMark } from '@/components/ui/GoogleMark'
import { buttonClass } from '@/components/ui/button'

/**
 * Google sign-in, entirely in the browser.
 *
 * **Replaces two route handlers** (`/auth/login/google` and
 * `/auth/callback/google`). It works because Supabase supports a fully
 * client-side PKCE flow: with `flowType: 'pkce'` and `detectSessionInUrl: true`
 * the client generates the code verifier, stores it, redirects to Google, and
 * exchanges the code on return. No server participates.
 *
 * Two problems went away with the handlers, and both were real:
 *
 * **The PKCE verifier no longer needs a cookie.** The old route existed
 * specifically so the server client could write the verifier somewhere the
 * callback could read it. `@supabase/ssr`'s browser client keeps it in
 * `document.cookie`, which is the same storage the session itself uses — so an
 * installed PWA and a browser tab behave identically, with no server round-trip
 * to lose it.
 *
 * **ADR-025 stops being a hazard.** That ADR exists because the route built its
 * callback from `request.nextUrl.origin`, and on Netlify that resolves to the
 * *deploy* URL — so hitting a preview produced an OAuth callback aimed at
 * production, which Supabase accepted, so the flow started, and the session
 * cookie landed on the wrong host. A misconfiguration that looked like success.
 *
 * Now `redirectTo` is whatever origin the browser is actually on. A deploy
 * preview sends its own URL, Supabase compares it against the allowlist, and
 * **rejects it loudly**. The failure moved from silent to obvious, which is the
 * whole improvement. It does mean each deploy preview needs an allowlist entry
 * with the branch name in it, which `netlify.toml` already documents.
 *
 * **This cannot be used from a static export without a change**, because it no
 * longer needs one — the opposite problem, and the reason Phase 5 gets simpler.
 *
 * The `next` parameter is validated the same way the route validated it: only
 * same-site paths, because an absolute URL here is an open redirect. It rides
 * through OAuth in the `redirectTo` query string rather than in `state`, so it
 * survives the provider round-trip without a custom state parameter to keep in
 * step.
 */
export function GoogleSignIn({
  next = '/dashboard',
  remember = true,
}: {
  next?: string
  /** The sign-in form's "keep me signed in" checkbox. See the note below. */
  remember?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  function signIn() {
    setError(null)

    startTransition(async () => {
      /**
       * The preference, written from the browser because this flow never touches
       * the server's cookie writer.
       *
       * `proxy.ts` reads `tk.remember` and stamps the session cookies on every
       * write, so setting it here means the preference is already in place by the
       * time the callback route's request passes through the proxy — the same
       * mechanism the password path uses, reached from the other side.
       *
       * Best-effort by nature: the browser Supabase client writes its own session
       * cookie with `document.cookie` and nothing can add a lifetime to that
       * particular write. It is corrected on the proxy's next rewrite, which is the
       * first server-rendered request after the callback.
       */
      document.cookie = rememberCookieString(remember)

      const supabase = createClient()
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback/google?next=${encodeURIComponent(
            safeNext,
          )}`,
        },
      })

      if (oauthError) {
        setError('Google sign-in is unavailable right now. Use your email and password instead.')
        return
      }

      // No navigation here on purpose: `signInWithOAuth` assigns
      // `window.location`, and anything after it in this task would race the
      // unload. The callback route resumes the app.
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className={`${buttonClass('quiet', { block: true })}`}
      >
        <GoogleMark />
        {pending ? 'Opening Google…' : 'Continue with Google'}
      </button>

      {error && (
        <p className="tk-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
