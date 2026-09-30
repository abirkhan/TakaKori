import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Exchanges a `token_hash` from an email link for a session cookie.
 *
 * This must be a Route Handler rather than a page: Server Components cannot
 * write cookies, so a page could not persist the session it just created.
 *
 * Requires the email templates to send `token_hash` rather than the default
 * `{{ .ConfirmationURL }}`:
 *   Dashboard > Authentication > Email Templates > Confirm signup
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  // Build the redirect without the secret, so the token never lands in
  // browser history or a referrer header after the exchange.
  const redirectTo = request.nextUrl.clone()
  redirectTo.searchParams.delete('token_hash')
  redirectTo.searchParams.delete('type')

  if (token_hash && type) {
    const supabase = await createClient()

    const { error } = await supabase.auth.verifyOtp({ type, token_hash })

    if (!error) {
      redirectTo.pathname = '/dashboard'
      redirectTo.searchParams.delete('next')
      return NextResponse.redirect(redirectTo)
    }

    console.error('OTP verification failed:', error.message)
  }

  redirectTo.pathname = '/login'
  redirectTo.searchParams.set('error', 'confirmation_failed')
  return NextResponse.redirect(redirectTo)
}