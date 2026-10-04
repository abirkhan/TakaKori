import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'

/**
 * The unauthenticated shell.
 *
 * Login, signup and password reset share one screen shape: the brand wash
 * fills the top third, the lockup sits inside it, and the form floats on white
 * below. Reusing the wash from the authenticated shell means the brand is
 * introduced before the user has an account, and the first thing they see after
 * signing in is the same surface with content on it.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <div className="tk-wash" aria-hidden="true" />

      <div className="tk-shell relative flex min-h-dvh flex-col justify-center py-10">
        <Link
          href="/"
          className="mb-8 flex flex-col items-center gap-3 text-center"
          aria-label="TakaKori home"
        >
          <Logo size={44} />
          <p className="tk-body text-muted">Track where your money goes</p>
        </Link>

        <div className="tk-card mx-auto w-full max-w-sm">{children}</div>

        <p className="tk-caption mx-auto mt-8 max-w-xs text-center">
          Built for Bangladesh. Your data stays in your account — nothing is sold, shared, or read
          by a human.
        </p>
      </div>
    </div>
  )
}
