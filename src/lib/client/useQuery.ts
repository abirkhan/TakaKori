'use client'

import { useEffect, useRef, useState } from 'react'
import { hydrateCache, hydrateProfile, primeProfile, readThrough, type CachedValue } from './cache'

/** Anything older than this is described as a sync time rather than presented live. */
const STALE_AFTER_MS = 5 * 60_000

interface State<T> {
  /** The cache key this state belongs to. */
  key: string
  entry: CachedValue<T> | null
  error: string | null
  stale: boolean
}

/**
 * Client-side data loading for one query.
 *
 * **`key` must encode every input the query depends on** — the range, the
 * filters, the flags. `transactions?range=2026-10` and `transactions?range=2026-11`
 * are different queries, and a cache that confuses them shows one month as
 * another. That is the whole contract, and it is why there is no separate `deps`
 * argument: a caller who forgets to list a dependency gets a stale screen with
 * no error, which is the worst of both designs.
 *
 * **State is tagged with the key it belongs to, and `loading` is derived from
 * it**, rather than being reset by the effect. Two things follow. Changing `key`
 * re-enters the loading state without an extra render, because the stale entry
 * simply does not match. And the effect body calls no `setState` at all — it
 * subscribes to an external system and updates when that system answers, which
 * is the shape React's `set-state-in-effect` rule is asking for. Setting a
 * `loading` flag in the body would cascade a render on every mount to say
 * something the state already implied.
 *
 * Returns `stale` rather than a raw timestamp. Comparing `Date.now()` to `at`
 * during render would be impure — the same tree could report a figure as fresh
 * on one pass and stale on the next — so the comparison happens once, when the
 * data lands, and the screen reads a boolean. The design system's rule against a
 * bare figure with no provenance is enforced here rather than left to eleven call
 * sites.
 *
 * Errors are returned rather than thrown. A screen that fails to load shows an
 * empty state with a reason; it does not blank to an error boundary. That is the
 * behaviour ADR-020 established for destructive actions, applied to reads.
 */
export function useQuery<T>(
  /**
   * The cache key, or `null` to not fetch yet.
   *
   * `null` is not a rare case here — it is the normal first frame of every
   * screen that resolves a date range. The range needs `profiles.timezone`
   * (ADR-006), so the timezone has to arrive before the key that contains it can
   * be built. Fetching under a placeholder key and then re-keying would put a
   * wrong-keyed entry in the cache and fire a request that can only be discarded.
   *
   * While the key is null this hook reports `loading: true` and holds no state,
   * so a caller can treat "waiting for the profile" and "waiting for the range"
   * as one thing rather than two.
   */
  key: string | null,
  fetcher: () => Promise<T>,
): {
  data: T | null
  /** When `data` was true. `null` until the first load. */
  at: number | null
  /** True when `data` was served from cache rather than fetched now. */
  stale: boolean
  error: string | null
  loading: boolean
} {
  const [state, setState] = useState<State<T> | null>(null)

  /**
   * The fetcher changes identity on every render — callers pass an inline
   * closure — so it cannot be an effect dependency. Held in a ref instead, and
   * written by the effect declared below *this* one, because React runs effects
   * in declaration order.
   */
  const fetcherRef = useRef(fetcher)

  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    // No key yet: stay loading, and touch no state. Returning early here is also
    // what keeps this effect free of a synchronous `setState`.
    if (key === null) return

    let cancelled = false
    void hydrateCache()
    void hydrateProfile()

    readThrough<T>(key, () => fetcherRef.current()).then(
      (entry) => {
        if (cancelled) return
        // The profile is persisted separately and for good reason: every screen
        // needs its timezone before it can resolve a date range (ADR-006), so an
        // offline launch with no persisted profile cannot know today's date.
        if (key === 'profile') primeProfile(entry.value as { timezone: string; currency: string })
        setState({
          key,
          entry,
          error: null,
          // Computed once, on arrival. Doing it during render would mean the same
          // tree could report a figure as fresh on one pass and stale on the next.
          stale: Date.now() - entry.at > STALE_AFTER_MS,
        })
      },
      (cause: unknown) => {
        if (cancelled) return
        // A failed load clears the entry rather than leaving a stale value next
        // to an error, which is the pair a user cannot act on.
        setState({
          key,
          entry: null,
          error: cause instanceof Error ? cause.message : 'Could not load this',
          stale: false,
        })
      },
    )

    return () => {
      cancelled = true
    }
  }, [key])

  // Anything recorded for a different key describes a screen the user has left.
  const mine = state?.key === key ? state : null

  return {
    data: mine?.entry?.value ?? null,
    at: mine?.entry?.at ?? null,
    stale: mine?.stale ?? false,
    error: mine?.error ?? null,
    loading: mine === null,
  }
}
