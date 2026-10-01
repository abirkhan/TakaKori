import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Starts the Google OAuth PKCE flow.
 *
 * A route handler rather than a client call so the PKCE code verifier is stored
 * in a cookie by the server client. In Next.js the framework writes that cookie
 * to the response, so the redirect needs no extra headers.
 *
 * Requires the Google provider to be enabled in the Supabase dashboard, with
 * this callback URL registered:
 *   {SITE_URL}/auth/callback/google
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const next = request.nextUrl.searchParams.get('next') ?? '/dashboard'
  // Only same-site paths. An absolute URL here would be an open redirect.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Server-side only: the browser must not start the flow, or the PKCE
      // verifier never lands in a cookie the callback can read.
      skipBrowserRedirect: true,
      redirectTo: `${request.nextUrl.origin}/auth/callback/google?next=${encodeURIComponent(safeNext)}`,
    },
  })

  if (error || !data.url) {
    return NextResponse.redirect(new URL('/login?error=oauth_unavailable', request.url))
  }

  return NextResponse.redirect(data.url)
}
