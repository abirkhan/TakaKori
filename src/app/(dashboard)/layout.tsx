import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { signOut } from '@/app/(auth)/actions'
import { BottomNav, HeaderNav } from '@/components/ui/NavBar'
import { Logo } from '@/components/ui/Logo'
import { Icon } from '@/components/ui/Icon'

/**
 * The authenticated shell.
 *
 * Mobile-first, in this order and not the other way round: the app bar carries
 * identity and sign-out, the bottom bar carries navigation, and the content
 * column is one narrow column that widens into a grid at larger breakpoints.
 *
 * `tk-wash` is the brand gradient. It sits behind the top of *every* screen, so
 * moving between tabs shows one continuous surface rather than a header that
 * re-declares itself on each route.
 *
 * Sign-out is a plain `<form action={signOut}>`: it must work with JavaScript
 * unavailable, on a metered connection, in a PWA that has been backgrounded.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireUser()

  return (
    <div className="relative min-h-dvh">
      <div className="tk-wash" aria-hidden="true" />

      <a href="#main" className="tk-skip">
        Skip to content
      </a>

      <header className="relative">
        <div className="tk-shell flex items-center gap-3 py-4">
          <Link href="/dashboard" className="shrink-0" aria-label="TakaKori home">
            <Logo size={34} />
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <HeaderNav />
            {email && (
              <span className="tk-caption hidden max-w-[18ch] truncate lg:inline">{email}</span>
            )}
            <form action={signOut}>
              <button
                type="submit"
                className="tk-btn tk-btn-ghost tk-btn-sm"
                aria-label="Sign out"
                title="Sign out"
              >
                <Icon name="logout" size={17} />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Clearance for the fixed tab bar plus the home indicator on a phone. */}
      <main id="main" className="tk-shell relative pb-32 md:pb-12">
        {children}
      </main>

      <BottomNav />
    </div>
  )
}
