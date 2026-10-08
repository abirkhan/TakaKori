import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { BottomNav, HeaderNav } from '@/components/ui/NavBar'
import { Logo } from '@/components/ui/Logo'
import { InstallBanner } from '@/components/app/InstallPrompt'
import { Toaster } from '@/components/app/Toast'
import { SignOutButton } from '@/components/app/SignOutButton'
import { OutboxDrain } from '@/components/app/OutboxDrain'

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
 * Sign-out is a form posting a Server Action, upgraded after hydration to a
 * client path that also clears the cached workspace and figures — see
 * `components/app/SignOutButton.tsx`. The Server Action is kept deliberately:
 * it is the path that works with JavaScript unavailable, on a metered
 * connection, in a PWA that has been backgrounded.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireUser()

  return (
    <div className="relative min-h-dvh">
      <div className="tk-wash" aria-hidden="true" />

      {/* Replays writes queued while offline. Here rather than the root layout so it
          runs only where the user has data, and not on sign-in. Renders nothing. */}
      <OutboxDrain />

      <a href="#main" className="tk-skip">
        Skip to content
      </a>

      <header className="relative">
        <div className="tk-shell flex items-center gap-3 py-4">
          <Link href="/dashboard" className="shrink-0" aria-label="TakaKori home">
            <Logo size={34} />
          </Link>

          <div className="ml-auto flex items-center gap-2">
            {email && (
              <span className="tk-caption hidden max-w-[18ch] truncate lg:inline">{email}</span>
            )}
            <HeaderNav />
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* This sits in normal flow between the app bar and the content, so it
          pushes the page down rather than covering it. Nothing here is `fixed`:
          the wash, the floating action button and the tab bar already compete for
          the edges of this screen, and a third fixed element is the failure
          ADR-031 measured — 113 focusable elements sitting under a bar.

          The offline banner is in the root layout instead, because losing signal
          matters on the sign-in screen too: that is precisely where a user taps
          submit and waits for nothing to happen. */}
      <InstallBanner />

      {/* Clearance for the fixed tab bar, derived from `--nav-clear` rather than
          a literal. The two are declared together in globals.css so they cannot
          drift apart — the previous hard-coded `pb-32` against an implicit ~77px
          bar is how 113 controls ended up underneath it. */}
      <main
        id="main"
        className="tk-shell relative md:pb-12"
        style={{ paddingBottom: 'var(--nav-clear)' }}
      >
        {children}
      </main>

      <BottomNav />

      {/* Outermost, so it is the last thing mounted and the first thing read.
          Floating by design — unlike everything else in this shell — because a
          confirmation that pushed the content down would move the row the user
          had just written to. Its layer is `pointer-events: none`, so it never
          intercepts a tap meant for the list. See `components/app/Toast.tsx`. */}
      <Toaster />
    </div>
  )
}
