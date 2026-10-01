'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Landing point for the confirmation and password-reset links.
 *
 * Supabase sends the token in the URL *fragment*, which the browser never
 * transmits to the server. So this has to be a Client Component: the browser
 * client reads the fragment, exchanges it for a session, writes cookies, and
 * only then can the server see the user.
 *
 * This is the zero-configuration path — it works with Supabase's default email
 * template. The server-side alternative lives in src/app/auth/confirm/route.ts.
 */
export function AuthCallback() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function handle() {
      const supabase = createClient()

      // getSession() reads the fragment and, on a valid token, persists the
      // resulting session into cookies.
      const { data, error: sessionError } = await supabase.auth.getSession()

      if (cancelled) return

      if (sessionError) {
        setError(sessionError.message)
        return
      }

      if (data.session) {
        // Replace the URL so the token is not left in history.
        window.history.replaceState({}, '', '/auth/callback')
        router.replace('/dashboard')
        router.refresh()
        return
      }

      // No token in the fragment: the link may have been opened in a browser
      // that stripped it, or it has expired.
      setError('This link is no longer valid. It may have expired or already been used.')
    }

    void handle()
    return () => {
      cancelled = true
    }
  }, [router])

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Link expired</h2>
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
        <a href="/login" className="text-sm underline">
          Back to sign in
        </a>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-medium">Signing you in…</h2>
      <p className="text-sm text-neutral-500">This should only take a moment.</p>
    </div>
  )
}
