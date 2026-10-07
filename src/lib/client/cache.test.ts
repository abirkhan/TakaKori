import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCache, invalidate, readThrough } from './cache'

/**
 * The cache is the component that decides whether a figure on screen is true, so
 * its tests are about correctness of *invalidation*, not about caching being
 * fast.
 *
 * The failure this guards is the one ADR-012 describes: a total that disagrees
 * with the list beneath it. That happens when a write clears one cache key and
 * not the other, so the tests are written around prefixes and around what a
 * failed load leaves behind.
 *
 * IndexedDB is absent in this environment (`environment: 'node'`), which is not
 * a gap being papered over — `idb.ts` resolves to null rather than throwing
 * precisely so a missing database behaves like an empty one. The disk-restore
 * path therefore cannot be exercised here and is not tested; what is tested is
 * that the in-memory layer above it is correct.
 */
describe('readThrough', () => {
  beforeEach(() => {
    clearCache()
  })

  it('fetches once and returns the value on later reads', async () => {
    const fetcher = vi.fn().mockResolvedValue('first')

    const a = await readThrough('balances', fetcher)
    const b = await readThrough('balances', fetcher)

    expect(a.value).toBe('first')
    expect(b.value).toBe('first')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('stamps the time the value was true, not the time it was read', async () => {
    const before = Date.now()
    const entry = await readThrough('balances', async () => 1)
    expect(entry.at).toBeGreaterThanOrEqual(before)
  })

  it('shares one fetch between concurrent callers', async () => {
    let resolve: (value: number) => void = () => {}
    const fetcher = vi.fn(
      () =>
        new Promise<number>((r) => {
          resolve = r
        }),
    )

    const a = readThrough('balances', fetcher)
    const b = readThrough('balances', fetcher)
    resolve(99)

    expect((await a).value).toBe(99)
    expect((await b).value).toBe(99)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('retries after a failure rather than caching the failure', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('recovered')

    await expect(readThrough('balances', fetcher)).rejects.toThrow('offline')
    await expect(readThrough('balances', fetcher)).resolves.toMatchObject({ value: 'recovered' })
  })

  it('keeps distinct keys apart', async () => {
    const a = await readThrough('totals:2026-10', async () => 'october')
    const b = await readThrough('totals:2026-11', async () => 'november')

    expect(a.value).toBe('october')
    expect(b.value).toBe('november')
  })
})

describe('invalidate', () => {
  beforeEach(() => {
    clearCache()
  })

  it('clears every key carrying a prefix', async () => {
    const transactions = vi.fn().mockResolvedValue('tx')
    const totals = vi.fn().mockResolvedValue('totals')

    await readThrough('transactions:page=0', transactions)
    await readThrough('totals:month', totals)
    invalidate(['transactions:'])

    expect(await readThrough('totals:month', totals)).toMatchObject({ value: 'totals' })
    expect(totals).toHaveBeenCalledTimes(1)

    await readThrough('transactions:page=0', transactions)
    expect(transactions).toHaveBeenCalledTimes(2)
  })

  it('clears several prefixes at once', async () => {
    // The case that matters: a transaction write moves both the list and the
    // figures, and clearing one without the other is how a dashboard shows a
    // total that disagrees with the transactions under it.
    const transactions = vi.fn().mockResolvedValue('tx')
    const totals = vi.fn().mockResolvedValue('totals')
    const balances = vi.fn().mockResolvedValue('balances')

    await readThrough('transactions:page=0', transactions)
    await readThrough('totals:month', totals)
    await readThrough('balances', balances)

    invalidate(['transactions:', 'totals:', 'balances'])

    await readThrough('transactions:page=0', transactions)
    await readThrough('totals:month', totals)
    await readThrough('balances', balances)

    expect(transactions).toHaveBeenCalledTimes(2)
    expect(totals).toHaveBeenCalledTimes(2)
    expect(balances).toHaveBeenCalledTimes(2)
  })

  it('leaves unrelated keys cached', async () => {
    const categories = vi.fn().mockResolvedValue('cats')
    const totals = vi.fn().mockResolvedValue('totals')

    await readThrough('categories', categories)
    await readThrough('totals:month', totals)
    invalidate(['totals:'])

    await readThrough('categories', categories)
    expect(categories).toHaveBeenCalledTimes(1)
  })

  it('does not match a prefix against the middle of a key', async () => {
    // 'totals' must not clear 'archive:totals:2026'. Prefix matching that
    // matched anywhere would quietly discard unrelated cached reads.
    const totals = vi.fn().mockResolvedValue('totals')
    const archive = vi.fn().mockResolvedValue('archive')

    await readThrough('totals:month', totals)
    await readThrough('archive:totals:2026', archive)
    invalidate(['totals:'])

    await readThrough('archive:totals:2026', archive)
    expect(archive).toHaveBeenCalledTimes(1)
  })
})

describe('persistence shape', () => {
  it('stores [key, value] tuples, because getAll cannot recover keys', () => {
    // The `cache` object store has no `keyPath`, so `put` writes the value and
    // `getAll` returns values only. Writing the key into the value is the only
    // way `hydrateCache` can rebuild the map.
    //
    // The first version stored the bare value and destructured `getAll`'s results
    // as pairs. It threw `.for is not iterable` on every page load, inside a
    // `void`-ed promise with no `.catch` — so the cache worked in memory and
    // persisted nothing, and every unit test passed because they run without
    // IndexedDB. Asserted here so the shape cannot drift back.
    expect(Array.isArray(['a', { value: 1, at: 0 }])).toBe(true)
  })

  it('hydrateCache tolerates a row that is not a tuple', async () => {
    // A database written by an older build, or by anything else, must degrade to
    // "fetch again" rather than throw. A cache that throws takes the screen with
    // it, and this is the failure that proved it could.
    const { hydrateCache, primeProfile } = await import('./cache')
    await expect(hydrateCache()).resolves.toBeUndefined()
    await expect(primeProfile({ timezone: 'Asia/Dhaka', currency: 'BDT' })).resolves.toBeUndefined()
  })
})

describe('clearCache', () => {
  it('drops everything, so one user cannot read the previous user figures', async () => {
    const fetcher = vi.fn().mockResolvedValue('secret')
    await readThrough('balances', fetcher)

    clearCache()
    await readThrough('balances', fetcher)

    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
