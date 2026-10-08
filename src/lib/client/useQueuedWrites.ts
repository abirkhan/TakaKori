'use client'

import { useCallback, useEffect, useState } from 'react'
import { subscribeToOutbox, indexedDbOutbox, type OutboxStore, type QueuedWrite } from './outbox'

/**
 * What is waiting to sync, re-read whenever the queue changes.
 *
 * **Why a queued write has to be visible.** It is the only record in the app the
 * server has not seen. Tell a user their expense is "saved on this device", close
 * the sheet, and show them nothing further, and the reasonable conclusion is that
 * it went somewhere they can find. The entry looks lost — which is precisely the
 * outcome this feature was built to prevent, arrived at by hiding the fix rather
 * than by lacking it.
 *
 * Subscribes rather than polling, so a queued write appears the moment it is
 * stored, and disappears the moment a drain removes it.
 *
 * `store` is injectable so the sorting and grouping can be tested without
 * IndexedDB, which is where the parts worth testing actually are.
 */
export function useQueuedWrites(store: OutboxStore = indexedDbOutbox): QueuedWrite[] {
  const [writes, setWrites] = useState<QueuedWrite[]>([])

  /**
   * One read, shared by the first load and by every notification afterwards.
   *
   * `setState` sits inside a `.then` rather than an `async` body, for the same
   * reason it does in `useQuery`: `react-hooks/set-state-in-effect` is right to
   * reject a synchronous setState in an effect body, and a promise callback is
   * unambiguously not that. `isCancelled` is a predicate rather than a flag so the
   * subscription can share this without owning a teardown of its own.
   */
  const read = useCallback(
    (isCancelled: () => boolean) => {
      store.all().then((rows) => {
        if (isCancelled()) return
        // Oldest first, so a held list reads in the order the user recorded them.
        setWrites(rows.sort((a, b) => a.queuedAt - b.queuedAt))
      })
    },
    [store],
  )

  useEffect(() => {
    let cancelled = false
    read(() => cancelled)
    const unsubscribe = subscribeToOutbox(() => read(() => false))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [read])

  return writes
}

/** The subset that needs the user's attention rather than merely syncing. */
export function failedWrites(writes: QueuedWrite[]): QueuedWrite[] {
  return writes.filter((write) => write.status === 'failed')
}