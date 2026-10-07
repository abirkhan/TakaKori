'use client'

import { useOffline } from 'next/offline'
import { Icon } from '@/components/ui/Icon'

/**
 * Connectivity banner.
 *
 * **It says what is true, not what is alarming.** TakaKori's users are on
 * metered connections, so being offline is an ordinary state for this app rather
 * than an incident, and it gets the informational tone rather than the warning
 * one. A banner that cries wolf about a condition the audience lives in
 * teaches people to ignore banners.
 *
 * The wording is chosen for what is about to happen rather than for the fact:
 * a user who loses signal mid-form is about to have a submission wait, and
 * saying so is more use than announcing the absence of a network. The second
 * sentence is also the promise the offline work in `docs/spa-pwa-feasibility.md`
 * has to keep — a cached figure is only honest if the app says it is cached.
 *
 * **It is not dismissible.** Connectivity is not the user's decision, and a
 * dismissed connectivity banner is a wrong one.
 *
 * `useOffline()` rather than `navigator.onLine`, which reports the OS network
 * interface and still says `true` for a phone on a WiFi with no upstream
 * internet — the exact case where a user needs to be told.
 *
 * It renders nothing during server rendering and on first hydration, because
 * there is no meaningful answer until the browser has spoken. That is a flash
 * of nothing on a slow connection, which is the right trade: showing "online" and
 * then correcting it is worse than showing nothing.
 *
 * Placement is a flow sibling above `{children}`, not a fixed overlay. It pushes
 * content down rather than covering it, so it cannot collide with the tab bar,
 * the floating action button or a sheet's footer — the class of collision ADR-031
 * spent a whole entry documenting.
 */
export function OfflineBanner() {
  const isOffline = useOffline()

  if (!isOffline) return null

  return (
    <div role="status" className="bg-surface border-hairline border-b">
      <div className="tk-alert tk-alert-info m-3 mb-0">
        <Icon name="info" size={17} className="mt-px shrink-0" />
        <span>
          <strong className="font-semibold">Offline.</strong> Anything you save will wait for a
          connection. Figures on screen are from the last time this device synced.
        </span>
      </div>
    </div>
  )
}
