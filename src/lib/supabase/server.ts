/**
 * Server Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Reads the session from cookies set by proxy.ts. Because Server Components
 * cannot write cookies, this client MUST NOT attempt to refresh an expired
 * token — proxy.ts does that. A refresh here silently fails to persist.
 *
 * Never import the service-role key here. All access goes through RLS as the
 * signed-in user.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { wantsRemember, withRemember } from './remember'

export const createClient = cache(async () => {
  const cookieStore = await cookies()

  /**
   * Read at construction, not inside `setAll`.
   *
   * The sign-in action writes `tk.remember` *before* it calls into Supabase, so by
   * the time auth-js asks to write the session cookies the preference is already
   * in the store and can be read here. Reading it lazily inside `setAll` would
   * work too, but it hides an ordering dependency that is load-bearing: the
   * cookie must be set first.
   */
  const remember = wantsRemember(cookieStore.getAll())

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, withRemember(name, options, remember))
            }
          } catch {
            // Called from a Server Component, which cannot write cookies.
            // Safe to ignore: proxy.ts already refreshed the session, and
            // Server Actions / Route Handlers reach this path and can write.
          }
        },
      },
    },
  )
})
