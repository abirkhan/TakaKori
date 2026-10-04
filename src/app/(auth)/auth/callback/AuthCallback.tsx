import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Logo } from '@/components/ui/Logo'
import { Icon } from '@/components/ui/Icon'

export async function AuthCallback() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The exchange may already have completed by the time this renders. Either
  // way, refresh so the layout's server-side guards see the new cookie rather
  // than rendering an authed tree from a stale one.
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <Logo size={40} variant="mark" />

      <p className="tk-body text-muted">
        {user
          ? 'Confirming your email…'
          : 'Finishing sign-in. If this does not continue, the link may have expired.'}
      </p>

      {user && (
        <span className="tk-eyebrow flex items-center gap-1.5">
          <Icon name="info" size={14} />
          Redirecting
        </span>
      )}

      <Link href={user ? '/dashboard' : '/login'} className="tk-btn tk-btn-primary">
        {user ? 'Continue' : 'Back to sign in'}
      </Link>
    </div>
  )
}
