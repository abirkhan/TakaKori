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

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

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
            supabaseResponse.cookies.set(name, value, options)
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
  const isSignedIn = Boolean(data?.claims?.sub)

  if (!isSignedIn && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (isSignedIn && request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
