import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Google OAuth callback.
 *
 * Exchanges the `code` query parameter for a session. Next.js writes the
 * resulting cookies to the response via the server client's cookie adapter, so
 * the browser is authenticated when the redirect lands.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const nextParam = request.nextUrl.searchParams.get('next')

  const safeNext =
    nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=oauth_missing_code', request.url))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('OAuth code exchange failed:', error.message)
    return NextResponse.redirect(new URL('/login?error=oauth_failed', request.url))
  }

  return NextResponse.redirect(new URL(safeNext, request.url))
}
