import { beforeAll, describe, expect, it, vi } from 'vitest'
import { hydrateCache, invalidate, readThrough, subscribeToCache } from './cache'

/**
 * What a *persisted* entry is allowed to do.
 *
 * `cache.test.ts` says outright that the disk-restore path cannot be exercised
 * there — IndexedDB is absent, `idb.ts` resolves to null, and the in-memory layer
 * is what gets tested. That was an honest gap rather than a false claim, and this
 * file closes it by standing the database up.
 *
 * The bug it guards is the one that made `creating an expense decreases the total
 * balance` fail with a delta of exactly 0 — before and after the same figure:
 *
 *   - `invalidate` drops entries from IndexedDB in a fire-and-forget chain
 *     (`import` → `idbAll` → `idbDelete`), so a reload landing inside that window
 *     re-hydrated the entry the write had just removed.
 *   - `readThrough` returned a disk hit immediately, so the reloaded document
 *     served it and never asked the network for the rest of the session.
 *
 * Add ৳123.45, reload, and the balance is the pre-write figure — indefinitely,
 * and looking entirely plausible. That is the ADR-012 failure mode arriving
 * through the layer written to prevent it, and no amount of green in-memory
 * tests was going to surface it.
 *
 * The contract, then: a snapshot is a **fallback for a failed fetch**, not a
 * shortcut around one. Offline it is the answer, because there is no question to
 * ask.
 */

/** Three distinct keys, so no test's `memory` write can satisfy another's read. */
const ON_DISK = [
  ['totals:refreshed', { value: 'stale', at: 1 }],
  ['totals:unreachable', { value: 'stale', at: 1 }],
  ['totals:offline', { value: 'stale', at: 1 }],
  ['totals:woken', { value: 'stale', at: 1 }],
]

vi.mock('./idb', () => ({
  idbAll: vi.fn(async () => ON_DISK),
  idbSet: vi.fn(async () => undefined),
  idbDelete: vi.fn(async () => undefined),
  idbClear: vi.fn(async () => undefined),
}))

describe('a persisted entry', () => {
  // `hydrateCache` is a one-shot per module instance: it flips `hydrated` before
  // it awaits, so calling it from several components does not re-read the store.
  // That means this file may hydrate exactly once, and every test has to find its
  // key already in `fromDisk` when it runs. Distinct keys are what make the
  // ordering irrelevant.
  beforeAll(async () => {
    await hydrateCache()
  })

  it('does not stand in for the fetch while the browser is online', async () => {
    let calls = 0
    const entry = await readThrough('totals:refreshed', async () => {
      calls += 1
      return 'fresh'
    })

    expect(calls).toBe(1)
    expect(entry.value).toBe('fresh')
  })

  it('is returned when the fetch fails, so a balance beats an empty screen', async () => {
    const entry = await readThrough('totals:unreachable', async () => {
      throw new Error('Failed to fetch')
    })

    // Not an empty string, not a zero — the last known figure, with its own
    // timestamp intact so the caller can say how old it is.
    expect(entry.value).toBe('stale')
    expect(entry.at).toBe(1)
  })

  it('is served directly when the browser reports itself offline', async () => {
    // An explicit `false` and nothing else counts as offline. `navigator.onLine`
    // is a hint, not a guarantee, and it is absent outside a browser — so
    // `=== false` rather than `!`, which would read "unknown" as "offline" and
    // serve a snapshot on a perfectly good connection.
    vi.stubGlobal('navigator', { onLine: false })
    try {
      let calls = 0
      const entry = await readThrough('totals:offline', async () => {
        calls += 1
        return 'fresh'
      })

      expect(calls).toBe(0)
      expect(entry.value).toBe('stale')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('is re-read from the network when a screen wakes up', async () => {
    /**
     * The regression guard, in the shape the bug actually took.
     *
     * A write invalidates; a reload arrives before the IndexedDB delete has
     * committed; the fresh document hydrates the pre-write entry. With a disk hit
     * returned as final, that balance stayed wrong for the whole session and no
     * assertion anywhere in the suite could see it — every test navigated *after*
     * the write and compared against a second reading of the same stale snapshot,
     * which is how a delta of exactly 0 was reported as a failure of arithmetic.
     *
     * A key nothing has read yet, so this exercises the disk path rather than a
     * `memory` hit left by an earlier test.
     */
    let served = ''
    let pending: Promise<unknown> | null = null
    const unsubscribe = subscribeToCache(() => {
      pending = readThrough('totals:woken', async () => 'fresh').then((entry) => {
        served = entry.value as string
      })
    })

    // A prefix that matches nothing still notifies, which is exactly the wake-up a
    // mounted `useQuery` gets after any write.
    invalidate(['totals:untouched:'])
    expect(pending, 'the subscriber was woken by the invalidation').not.toBeNull()
    await pending
    unsubscribe()

    expect(served).toBe('fresh')
  })
})
