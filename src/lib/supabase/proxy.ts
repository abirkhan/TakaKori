/**
 * Session refresh for proxy.ts.
 *
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`. The file must export a
 * function named `proxy` (or a default export) located beside `app/`.
 *
 * Supabase session tokens expire. Server Components cannot write cookies, so
 * without this file the refreshed token is never persisted and users get
 * logged out at random. This is the single most important file for auth.
 *
 * The docs note a hard limit: if the proxy matcher excludes a path, Server
 * Function calls on that path are skipped too. Never rely on proxy alone for
 * authorization — enforce it again inside every Server Action and query.
 */
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { wantsRemember, withRemember } from './remember'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  /**
   * Read once, here, rather than inside `setAll`.
   *
   * `setAll` is where every session cookie is written *including refreshes*, so
   * this is the only place that can keep "remember me" true past the first hour.
   * Stamping a long expiry at sign-in and stopping there looks correct and stops
   * working silently the first time auth-js rewrites the token.
   */
  const remember = wantsRemember(request.cookies.getAll())

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          supabaseResponse = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, withRemember(name, options, remember))
          }
        },
      },
    },
  )

  // Do NOT run code between createServerClient and getClaims(): it can cause
  // hard-to-debug session desync errors.
  //
  // getClaims() verifies the JWT signature locally against the JWKS and returns
  // the payload (data.claims.sub is the user id). It does NOT return a user
  // object — for that, use getUser(). A presence check is all this file needs,
  // and getClaims() avoids a network round-trip on every request.
  const { data } = await supabase.auth.getClaims()
  let isSignedIn = Boolean(data?.claims?.sub)

  if (!isSignedIn && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (isSignedIn && request.nextUrl.pathname === '/login') {
    // Only bounce the user away from /login once the auth server agrees.
    //
    // getClaims() is a local signature check, so a token the auth server would
    // reject — revoked session, dead refresh token — still looks valid here.
    // The page guard in lib/auth.ts uses getUser(), which does hit the network.
    // When the two disagree, /login redirects to /dashboard, the dashboard's
    // own guard fails, and it redirects back: an infinite loop that locks the
    // user out of the site with no way forward. Confirming over the network
    // before redirecting makes both layers agree on one definition of signed in.
    const { data: verified } = await supabase.auth.getUser()
    isSignedIn = Boolean(verified.user)
  }

  if (isSignedIn && request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
