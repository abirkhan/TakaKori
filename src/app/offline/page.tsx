import type { Metadata, Viewport } from 'next'
import { PageHeader } from '@/components/ui/PageHeader'
import { OfflineBanner } from '@/components/app/OfflineBanner'

/**
 * The last thing an offline launch should ever see.
 *
 * Reached only when the service worker has no cached copy of the route that was
 * asked for, so it is the failure floor rather than a normal screen: everything
 * else is served from cache. It is deliberately outside `(dashboard)`, so it
 * prerenders with no session check — an offline launch cannot verify a session,
 * and a page that needs one would be the page that cannot load.
 *
 * The wording is the design system's voice applied to an error: say what
 * happened and what to do next, never "Oops!" and never an exclamation mark.
 */
export const metadata: Metadata = {
  title: 'Offline',
  // Must not be indexed, and must not be cached as its own install surface.
  robots: { index: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a8256',
}

export default function OfflinePage() {
  return (
    <>
      <OfflineBanner />
      <div className="relative min-h-dvh">
        <div className="tk-wash" aria-hidden="true" />

        <main className="tk-shell relative pt-6">
          <PageHeader eyebrow="No connection" title="You are offline" />

          <section className="tk-card">
            <p className="tk-body">
              This page is not saved on this device. Anything you have already opened is still there
              — the transactions list, your balances, your budgets.
            </p>

            <p className="tk-body mt-3">
              Reconnect and it will load. Nothing you have already saved is lost.
            </p>

            <a href="/dashboard" className="tk-btn tk-btn-primary mt-5">
              Try again
            </a>
          </section>
        </main>
      </div>
    </>
  )
}
