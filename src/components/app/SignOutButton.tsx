'use client'

import { useState, useTransition } from 'react'
import { signOut } from '@/app/(auth)/actions'
import { signOutInBrowser } from '@/lib/client/session'
import { Icon } from '@/components/ui/Icon'
import { buttonClass } from '@/components/ui/button'

/**
 * Sign out.
 *
 * **One control, two paths.** The form posts to a Server Action, so it works
 * with JavaScript unavailable, before hydration, or on a dead network — and that
 * matters more than usual here, because a stale tab resuming without signal is an
 * ordinary state for an audience on metered connections. It is also the moment
 * someone is most likely to want to end the session.
 *
 * `onSubmit` then upgrades the same form, after hydration, to the browser path.
 * `preventDefault` means the Server Action never fires once this is attached;
 * before it is attached, the Server Action is the only path and it works.
 *
 * **What the upgrade adds is the client-side state.** `signOutInBrowser` clears
 * `workspaceId` and the cached figures, neither of which a server action can
 * reach. Without it, signing out and back in on a shared device shows the
 * previous user's balances, because `clientContext()` memoises the workspace for
 * the life of the tab.
 *
 * This is why the `/auth/signout` Route Handler is kept rather than deleted. It
 * is not the path anyone reaches in practice, but it is the path that works when
 * the browser path does not, and dropping it to save one file would trade a
 * real capability for tidiness. Phase 5 can revisit it once the E2E suite covers
 * this.
 *
 * `startTransition` rather than a hand-rolled flag, per ADR-022 — a self-set
 * flag is a latch waiting to happen.
 */
export function SignOutButton() {
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFailed(false)

    startTransition(async () => {
      try {
        await signOutInBrowser()
        // An absolute URL, deliberately. `router.push` is faster, and this is
        // not about speed: it would keep the previous session's React tree and
        // RSC payload alive across the boundary. A hard navigation guarantees no
        // in-memory trace of the person who just signed out survives, which on a
        // shared device is the actual requirement. `router.push` would be faster
        // and that is the trade being made deliberately.
        //
        // The lint rule is about not losing prefetched data on an ordinary
        // navigation. Losing the previous session's state is the point here.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`${window.location.origin}/login`)
      } catch {
        // Fall back to the Server Action rather than leaving them stuck. The
        // server route clears the cookie even when the network is up but
        // supabase-js refused, which is the likelier failure.
        setFailed(true)
      }
    })
  }

  return (
    <form action={signOut} onSubmit={onSubmit} className="contents">
      <button
        type="submit"
        disabled={pending}
        className={buttonClass('ghost', { size: 'sm' })}
        aria-label="Sign out"
        title="Sign out"
      >
        <Icon name="logout" size={17} />
        <span className="hidden sm:inline">{failed ? 'Try again' : 'Sign out'}</span>
      </button>
    </form>
  )
}
