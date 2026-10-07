'use client'

import { createClient } from '@/lib/supabase/client'
import { clearClientContext } from '@/lib/queries/client'
import { clearCache } from '@/lib/client/cache'

/**
 * Signing out, in the browser.
 *
 * Was `POST /auth/signout`, a Route Handler whose only job was to clear the
 * server cookie. The browser has been able to do that all along, and removing it
 * takes the last of the auth handlers that Phase 5 would otherwise have to
 * replace.
 *
 * **The two `clear` calls are the entire reason this is not a one-liner, and
 * they exist because of two pieces of state added by the client-side data work:**
 *
 * - `clearClientContext()` — `clientContext()` memoises `workspaceId` for the
 *   life of the tab, precisely because building it costs two round-trips and
 *   every query on every screen asks for it. That memoisation is correct for a
 *   session and dangerous across one. Without clearing it, signing out and
 *   signing in as someone else in the same tab leaves the first user's
 *   workspace id reachable, and the first query reads **their** data.
 * - `clearCache()` — same argument for the figures. `lib/client/cache.ts` keeps
 *   balances, transactions and the profile in memory and in IndexedDB. A stale
 *   balance is worse than an empty one, because an empty one is visibly empty
 *   and a stale one looks real.
 *
 * Neither is reachable from the server, which is the point: this had to move to
 * the client, and the client-side state is the reason it could not stay a
 * server action that merely drops a cookie.
 *
 * Sign-out **must work with JavaScript unavailable** — the dashboard layout's
 * comment says so explicitly, because it has to work on a metered connection and
 * in an installed PWA that has been backgrounded for a week. That requirement is
 * why the button keeps a plain form fallback rather than becoming a bare
 * `onClick`: see the layout.
 */
export async function signOutInBrowser(): Promise<void> {
  const supabase = createClient()
  // Cleared in a `finally`, and deliberately *after* the sign-out. Clearing
  // first would mean a sign-out that fails on a dead network also wipes the
  // session's workspace — leaving the user still signed in with a cache that
  // knows nothing, so every screen errors instead of every screen being
  // visibly empty. An empty balance is recoverable; an error wall is not.
  try {
    await supabase.auth.signOut()
  } finally {
    clearClientContext()
    clearCache()
  }
}
