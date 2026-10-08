'use client'

import { useOutboxDrain } from '@/lib/client/offlineWrites'

/**
 * Replays queued writes, and renders nothing.
 *
 * **Mounted in the dashboard layout rather than the root layout** so the drain only
 * runs where the user actually has data, and not on sign-in or password reset. It
 * fires on mount and on `online`; see `useOutboxDrain` for why there is no
 * background sync.
 *
 * A component rather than a hook call in a layout because layouts are server
 * components, and rendering nothing is deliberate — this is behaviour, not UI.
 */
export function OutboxDrain() {
  useOutboxDrain()
  return null
}