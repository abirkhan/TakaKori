'use client'

/**
 * The client-side read cache.
 *
 * Exists for one reason, and it is not performance: **it is what lets a screen
 * render with no network.** Every read this app performs is a view or an RPC
 * (ADR-004), so an offline balance cannot be recomputed locally — the SQL that
 * produces it does not run in a browser. The only honest offline figure is the
 * last one the database produced. That is what is stored here, with the time it
 * was true.
 *
 * **This is why there is no local aggregation.** Option 7b of
 * `docs/spa-pwa-feasibility.md` — recomputing balances in JavaScript over a
 * cached ledger — was rejected. It would mean a second implementation of the
 * money logic, and ADR-012 records a balance reading −10,499 instead of 69,501
 * while looking entirely plausible. One implementation, and a timestamp saying
 * how old it is, is the version that fails visibly instead of quietly.
 *
 * Hand-rolled rather than TanStack Query, which reverses the recommendation in
 * §7.3 of the feasibility study. The reason is recorded honestly: the outbox in
 * phase 4 needs custom IndexedDB work regardless, which removes most of the
 * "batteries included" argument, and without an integration suite I would rather
 * own code I can unit-test than depend on a library's internals.
 *
 * Three layers, deliberately: memory (fast, lost on reload), IndexedDB
 * (survives reload), and nothing else. There is no third-party cache to
 * invalidate.
 */

export interface CachedValue<T> {
  value: T
  /**
   * When this was true, not when it was cached. Both are the same moment here,
   * but the distinction matters the moment a cached value is ever served from a
   * different device's copy.
   */
  at: number
}

/** Invalidation is by key prefix, so a write can clear everything it affects. */
type Listener = () => void

/**
 * How an entry is stored in IndexedDB.
 *
 * `[key, value]`, not just the value. The `cache` object store is created
 * **without a `keyPath`** (see `idb.ts`), and on such a store `put` writes the
 * value and `getAll` returns values — so the key is not recoverable from a bulk
 * read. Writing it into the value is what makes `hydrateCache` able to rebuild
 * the map at all.
 *
 * The first version stored the bare value and destructured `getAll`'s results as
 * pairs. That threw `.for is not iterable` on every page load, silently, in a
 * `void`-ed promise with no `.catch` — so the cache worked perfectly in memory
 * and persisted nothing at all. Offline reads were reported as done because the
 * unit tests could not see IndexedDB. It surfaced only in a dev-server log.
 */
type CacheRow = [string, CachedValue<unknown>]

const memory = new Map<string, CachedValue<unknown>>()
const listeners = new Set<Listener>()
/** In-flight requests, keyed by cache key, so two callers share one fetch. */
const inFlight = new Map<string, Promise<unknown>>()

let hydrated = false
/**
 * Entries pulled from IndexedDB, keyed by cache key.
 *
 * Populated once per tab load. Reading them lazily per key would mean an
 * IndexedDB round-trip in the render path, which is the thing this layer exists
 * to avoid.
 */
let fromDisk = new Map<string, CachedValue<unknown>>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function subscribeToCache(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Loads persisted entries. Idempotent, and safe to call from any component. */
export async function hydrateCache(): Promise<void> {
  if (hydrated) return
  hydrated = true

  const { idbAll } = await import('@/lib/client/idb')
  const rows = await idbAll<CacheRow>('cache')
  for (const row of rows) {
    // Guarded rather than destructured. `put` on a store with no `keyPath` stores
    // the *value*, so `getAll` returns `[key, value]` only because this module
    // writes it that way — and a database written before that convention, or by
    // anything else, would hand back a bare value. A cache must degrade to "fetch
    // again", never to an exception that takes the screen down.
    if (!Array.isArray(row)) continue
    const [key, entry] = row
    if (typeof key !== 'string' || !entry) continue
    if (!memory.has(key)) fromDisk.set(key, entry as CachedValue<unknown>)
  }
  notify()
}

/**
 * Reads through the cache.
 *
 * Resolution order:
 *
 *   1. memory — this tab, just fetched
 *   2. IndexedDB — a previous session
 *   3. the fetcher
 *
 * **A persisted snapshot is a fallback, not a result.** Order 2 used to return
 * immediately, and that was a live bug: `invalidate` drops entries from IndexedDB
 * in a fire-and-forget chain (`import` → `idbAll` → `idbDelete`), so a reload
 * landing inside that window re-hydrated the entry the write had just removed.
 * The new document then served it and — because it returned at step 2 — never asked
 * the network for the rest of the session. Add ৳123.45, reload, and the balance is
 * the pre-write figure, indefinitely. That is the ADR-012 failure mode, produced by
 * the layer written to prevent it.
 *
 * So while the browser reports itself online, a cold entry is a *fallback for when
 * the fetch fails*, not a shortcut around it. Offline, it is the answer, because
 * there is no question to ask.
 *
 * The cost is that a reload no longer paints instantly from the snapshot; it waits
 * for the network the way any other page load does, and falls back if the network
 * is not there. Correct beats fast for a balance.
 *
 * The signature is `CachedValue | null` rather than the value alone because the
 * caller must be able to tell the user how old the figure is. Returning a bare
 * `T` invites rendering a stale balance as though it were live, which is the
 * exact failure this layer exists to prevent.
 */
export async function readThrough<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<CachedValue<T>> {
  const hot = memory.get(key)
  if (hot) return hot as CachedValue<T>

  const cold = fromDisk.get(key)

  // Offline, the snapshot is the answer. Tested as `=== false` rather than `!` on
  // purpose: `navigator.onLine` is a hint, not a guarantee — it says a network
  // interface exists, not that anything is reachable — and it is absent entirely
  // outside a browser. Only an explicit `false` is worth skipping a request over;
  // anything else tries the network and falls back to `cold` if it fails.
  if (cold && typeof navigator !== 'undefined' && navigator.onLine === false) {
    memory.set(key, cold)
    return cold as CachedValue<T>
  }

  // One fetch per key, however many components ask for it. Without this, a
  // dashboard with four figures issues four identical workspace queries, which
  // is exactly what `clientContext`'s memoisation exists to prevent for the
  // context and what would happen here without it for the data.
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<CachedValue<T>>

  const promise = fetcher()
    .then((value) => {
      const entry: CachedValue<T> = { value, at: Date.now() }
      memory.set(key, entry)
      // **No `notify()` here, and that is load-bearing.**
      //
      // `notify` means "what you are rendering is now wrong" — only an invalidation
      // or a sign-out makes that true. A *fill* does not: the caller that asked for
      // this value receives it from the returned promise, and any other component on
      // the same key shares the request through `inFlight` and receives the same one.
      //
      // Notifying on fetch is what turned the live-screen fix into a cascade. Each
      // subscriber's re-read missed, fetched, notified, and re-woke every other
      // subscriber — with five mounted reads on a screen, a 33-test suite took 31
      // minutes and 23 of them timed out on teardown.
      //
      // With notification on invalidation alone, one write is one notify and each
      // subscriber re-reads once. A re-read that misses fetches and stays silent, so
      // the system terminates by construction rather than by argument.
      void import('@/lib/client/idb').then(({ idbSet }) => idbSet('cache', key, [key, entry]))
      return entry
    })
    .catch((cause: unknown) => {
      // The network is unreachable or the query failed. A snapshot still beats an
      // empty screen, and `stale` is computed from its own timestamp, so the caller
      // can say how old it is.
      if (cold) return cold as CachedValue<T>
      throw cause
    })
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, promise)
  return promise as Promise<CachedValue<T>>
}

/**
 * Drops cached entries.
 *
 * Prefixes, because a write invalidates a set of reads and getting that set
 * wrong is how a dashboard shows a total that disagrees with the list beneath
 * it — the ADR-012 failure mode, one layer up. A transaction write therefore
 * clears `transactions:` and `totals:` together, never one without the other.
 */
export function invalidate(prefixes: string[]): void {
  const matched = (key: string) => prefixes.some((prefix) => key.startsWith(prefix))

  for (const key of memory.keys()) if (matched(key)) memory.delete(key)
  for (const key of fromDisk.keys()) if (matched(key)) fromDisk.delete(key)

  notify()
  void import('@/lib/client/idb').then(({ idbAll, idbDelete }) =>
    idbAll<[string, unknown]>('cache').then((rows) => {
      for (const row of rows) {
        if (!Array.isArray(row)) continue
        const [key] = row
        if (matched(key)) idbDelete('cache', key)
      }
    }),
  )
}

/**
 * The user's profile, read once and kept forever.
 *
 * Not cached like other reads, because of a specific dependency: **every screen
 * needs `timezone` before it can resolve a date range** (ADR-006). Cached like
 * the rest, an offline launch would have no timezone and no way to know today's
 * date — the range would either fail or silently fall back to something, and a
 * transaction filed on the wrong day is a wrong ledger.
 *
 * The timezone changes when a user travels, but rarely and not on the timescale
 * of a phone being offline. So it is read once and overwritten on every
 * successful fetch, and the persisted copy is a floor rather than a cache entry
 * with an expiry policy.
 *
 * `getProfile()` lives in the query facades, so this is the only place the
 * profile is persisted and the only place it is read back.
 */
let profileCache: CachedValue<{ timezone: string; currency: string }> | null = null

export async function primeProfile(profile: { timezone: string; currency: string }): Promise<void> {
  const entry: CachedValue<{ timezone: string; currency: string }> = {
    value: profile,
    at: Date.now(),
  }
  profileCache = entry
  memory.set('profile', entry as CachedValue<unknown>)
  fromDisk.set('profile', entry as CachedValue<unknown>)
  // Silent, like a fill. `primeProfile` runs on every successful profile read, and
  // it writes the very key the reader is holding — so notifying here would wake
  // every mounted read on the screen to re-read a cache that was just correctly
  // filled. The profile's own reader already has the value.
  void import('@/lib/client/idb').then(({ idbSet }) =>
    idbSet('cache', 'profile', ['profile', entry]),
  )
}

/**
 * The persisted profile, or null.
 *
 * Synchronous on purpose. It has to be: the decision it feeds — whether a range
 * can be resolved at all — is made during the first render, before any effect
 * has run. An async read would mean a frame where the app knows neither the date
 * nor that it does not know it.
 */
export function cachedProfile(): { timezone: string; currency: string } | null {
  return profileCache?.value ?? null
}

/** Loads the persisted profile. Call once, before the first screen resolves a range. */
export async function hydrateProfile(): Promise<void> {
  if (profileCache) return
  const { idbGet } = await import('@/lib/client/idb')
  // Reads come back in the same `[key, value]` shape they were written in — see
  // `CacheRow`. A bare value here is a database from before that convention, and
  // is simply skipped.
  const row = await idbGet<CacheRow>('cache', 'profile')
  const entry = (Array.isArray(row) ? row[1] : undefined) as
    CachedValue<{ timezone: string; currency: string }> | undefined
  if (!entry?.value?.timezone) return
  profileCache = entry
  memory.set('profile', entry as CachedValue<unknown>)
  fromDisk.set('profile', entry as CachedValue<unknown>)
}

/** Drops it. Part of sign-out, alongside the rest of the cache. */
export function clearCache(): void {
  profileCache = null
  memory.clear()
  fromDisk = new Map()
  inFlight.clear()
  notify()
  void import('@/lib/client/idb').then(({ idbClear }) => idbClear('cache'))
}
