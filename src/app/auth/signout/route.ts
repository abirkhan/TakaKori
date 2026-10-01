import { type NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Sign out.
 *
 * A POST route handler rather than a Server Action so it can be targeted by a
 * plain <form action>, which works without JavaScript.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()

  // getClaims() verifies the token; getSession() alone would trust unverified
  // cookie contents. It returns { data: { claims } | null }.
  const { data } = await supabase.auth.getClaims()

  if (data?.claims) {
    await supabase.auth.signOut()
  }

  revalidatePath('/', 'layout')
  return NextResponse.redirect(new URL('/login', req.url), { status: 302 })
}
