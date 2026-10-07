import type { NextConfig } from 'next'

/**
 * `experimental.useOffline` does two things, and it is worth being precise about
 * both, because the name oversells the first:
 *
 *  1. It exposes `useOffline()`, which reports connectivity. That is better than
 *     `navigator.onLine`, which reflects the OS network interface and still says
 *     `true` for a phone on a WiFi with no upstream internet — the exact case a
 *     user needs to be told about. `OfflineBanner` uses it.
 *
 *  2. A navigation, prefetch or Server Action that fails because the network is
 *     down stays *pending* and is retried when connectivity returns, rather than
 *     rejecting and showing an error.
 *
 * What it is **not** is a cache. Its own documentation is explicit that a full
 * page reload while offline still fails, because the browser needs the network to
 * deliver the document, and that "full offline loads would need a service
 * worker". Nor does it touch requests this app issues itself — every data read
 * goes through `supabase-js`, not `fetch`, so it is outside the framework's
 * retry entirely.
 *
 * So this flag buys an honest connectivity banner and a stalled navigation that
 * recovers on its own. Genuine offline reads are Phase 3 of
 * `docs/spa-pwa-feasibility.md` and need a service worker plus an IndexedDB data
 * cache. Do not read a green banner here as "offline is done".
 *
 * Experimental, and on by default in the Next.js 16 line. It is paired with
 * `loading.tsx` files rather than `cacheComponents`, which stays off on purpose:
 * `docs/architecture.md` records that enabling it would let a stale financial
 * total be served, and a balance must reflect the user's most recent
 * transaction.
 */
const nextConfig: NextConfig = {
  experimental: {
    useOffline: true,
  },
}

export default nextConfig
