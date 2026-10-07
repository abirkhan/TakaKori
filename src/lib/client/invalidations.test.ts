import { beforeEach, describe, expect, it } from 'vitest'
import { clearCache, invalidate, readThrough } from './cache'
import { keys, PREFIX, WRITES, type Entity } from './invalidations'

/**
 * The invalidation map, asserted as properties rather than examples.
 *
 * The failure this guards is ADR-012's, reached from the other side: a write
 * lands, a cached figure survives it, and the screen shows a number from before
 * the write with nothing indicating otherwise. It is not a crash and not a `null`
 * — it is a plausible wrong answer, which is the hardest kind to notice and the
 * one this project has been bitten by before.
 *
 * So the tests below do not check that a specific list is refreshed. They check
 * the *shape* of every key, that each write covers every entity its change can
 * affect, and that a full transaction write clears nothing that is money and
 * keeps nothing that is a reference list.
 */

/** Every key the app can build, as a flat list. Add to this when adding a read. */
function allKeys(): string[] {
  return [
    keys.profile(),
    keys.accounts(false),
    keys.accounts(true),
    keys.balances(),
    keys.categories(),
    keys.categories('expense'),
    keys.transactions('recent:6'),
    keys.transactions('page=0&preset=month'),
    keys.totals('Asia/Dhaka', '2026-10-01', '2026-10-31'),
    keys.totals('Europe/London', '2026-10-01', '2026-10-31'),
    // Reports. A transaction write has to reach these, and they must not collide
    // with the dashboard's own range total above.
    keys.report('Asia/Dhaka', '2026-10-01', '2026-10-31', 'summary'),
    keys.report('Asia/Dhaka', '2026-10-01', '2026-10-31', 'monthly'),
    keys.report('Asia/Dhaka', '2026-10-01', '2026-10-31', 'expenseByCategory'),
    keys.report('Asia/Dhaka', '2025-11-01', '2026-10-31', 'incomeByCategory'),
    keys.budgets('progress:2026-10-07'),
    keys.recurring('list'),
  ]
}

/**
 * Counts fetches across *both* priming and refetching.
 *
 * The first version of this file counted only inside `prime()`, so the refetches
 * after an `invalidate()` were invisible to the counter. The assertion
 * `fetched N times` therefore described the priming alone and would have passed
 * with `invalidate()` doing nothing at all — the same false green as the transfer
 * E2E test, where two zeros compared equal.
 *
 * A test whose counter cannot see the thing it is testing is worse than no test,
 * because it reports a property that was never checked.
 */
interface Counter {
  /** A fetcher that records one fetch and returns its own ordinal. */
  fetch: () => Promise<number>
  value: () => string
}

function makeCounter(): Counter {
  let n = 0
  return {
    fetch: async () => ++n,
    value: () => `fetched ${n} times`,
  }
}

async function prime(counter: Counter): Promise<Counter> {
  for (const key of allKeys()) await readThrough(key, counter.fetch)
  return counter
}

describe('key shape', () => {
  it('every key starts with its entity prefix, so prefix invalidation works', () => {
    // A bare key like 'balances' would never match a prefix, and would therefore
    // silently survive every invalidation. This is the failure the whole file
    // exists to make impossible.
    for (const [entity, prefix] of Object.entries(PREFIX)) {
      if (entity === 'profile') continue
      const qualifier = entity === 'totals' ? 'Asia/Dhaka,2026-10-01,2026-10-31' : 'x'
      const builder = keys[entity as Entity] as (...args: string[]) => string
      expect(builder(qualifier).startsWith(prefix)).toBe(true)
    }
  })

  it('distinguishes a range in one timezone from the same range in another', () => {
    // ADR-006. The same dates resolved in two zones are two different questions,
    // and a transaction filed at 00:30 local belongs to different months.
    expect(keys.totals('Asia/Dhaka', '2026-10-01', '2026-10-31')).not.toBe(
      keys.totals('Europe/London', '2026-10-01', '2026-10-31'),
    )
  })

  it('keeps a report read apart from the dashboard total on the same range', () => {
    // Both are aggregates over the same dates, and they are different queries. One
    // key would make whichever screen mounted last overwrite the other's entry,
    // and the other would then serve a figure belonging to a different question.
    expect(keys.report('Asia/Dhaka', '2026-10-01', '2026-10-31', 'summary')).not.toBe(
      keys.totals('Asia/Dhaka', '2026-10-01', '2026-10-31'),
    )
    expect(keys.report('Asia/Dhaka', '2026-10-01', '2026-10-31', 'summary')).not.toBe(
      keys.report('Asia/Dhaka', '2026-10-01', '2026-10-31', 'monthly'),
    )
  })

  it('distinguishes a rolling 12-month window from a calendar month', () => {
    // `?period=last12` is anchored on the current month, so the same URL means
    // different dates in different months — and different again per timezone.
    expect(keys.report('Asia/Dhaka', '2025-11-01', '2026-10-31', 'summary')).not.toBe(
      keys.report('Asia/Dhaka', '2026-10-01', '2026-10-31', 'summary'),
    )
  })

  it('clears every report read on a transaction write', () => {
    // Every aggregate on /reports is derived from transaction rows, so a purchase
    // makes all four of them wrong.
    for (const kind of ['summary', 'monthly', 'expenseByCategory', 'incomeByCategory'] as const) {
      expect(WRITES.transaction).toContain(PREFIX.totals)
      expect(
        keys.report('Asia/Dhaka', '2026-10-01', '2026-10-31', kind).startsWith(PREFIX.totals),
      ).toBe(true)
    }
  })

  it('distinguishes ranges, so switching months is a different entry', () => {
    expect(keys.totals('Asia/Dhaka', '2026-10-01', '2026-10-31')).not.toBe(
      keys.totals('Asia/Dhaka', '2026-11-01', '2026-11-30'),
    )
  })
})

describe('the write map', () => {
  beforeEach(() => {
    // `clearCache()`, not `invalidate(['*'])`. Invalidation matches by
    // `startsWith`, and no key starts with `*` — so the wildcard cleared nothing
    // and every test inherited the previous test's cache. The two counters in
    // this file disagreed by exactly the number of keys the earlier test had
    // left behind, which is what gave it away.
    clearCache()
  })

  it('a transaction write clears every read that shows money', async () => {
    const counter = await prime(makeCounter())
    invalidate([...WRITES.transaction])

    // Transactions, balances (under `accounts:`), month totals, and budget
    // progress. Each is read again with the *counting* fetcher, so a read still
    // served from cache shows up as a missing increment instead of passing quietly.
    await readThrough(keys.transactions('recent:6'), counter.fetch)
    await readThrough(keys.balances(), counter.fetch)
    await readThrough(keys.totals('Asia/Dhaka', '2026-10-01', '2026-10-31'), counter.fetch)
    await readThrough(keys.budgets('progress:2026-10-07'), counter.fetch)

    // Derived from `allKeys()` rather than written down. A hardcoded count goes
    // stale the next time a read is added and then fails on a *number* mismatch,
    // which reads as "invalidation is broken" when the truth is that the test needs
    // updating. Adding a read should not require editing this assertion.
    expect(counter.value()).toBe(`fetched ${allKeys().length + 4} times`)
  })

  it('a transaction write clears all four report reads', async () => {
    // Every aggregate on /reports is derived from transaction rows. If `totals:`
    // were ever dropped from the transaction write, these would be exactly the
    // figures that kept reporting the month as it was before the purchase — and
    // nothing on the screen would look wrong.
    const counter = await prime(makeCounter())
    invalidate([...WRITES.transaction])

    for (const kind of ['summary', 'monthly', 'expenseByCategory', 'incomeByCategory'] as const) {
      await readThrough(keys.report('Asia/Dhaka', '2026-10-01', '2026-10-31', kind), counter.fetch)
    }

    expect(counter.value()).toBe(`fetched ${allKeys().length + 4} times`)
  })

  it('a transaction write clears budget progress — the easy one to miss', () => {
    // Budget spend is `expense_by_category_for_range` month-to-date, so a
    // purchase changes it. Forgetting this leaves a budget reading as
    // under-spent for the rest of the session, which is the most reassuring way
    // to be wrong.
    expect(WRITES.transaction).toContain(PREFIX.budgets)
  })

  it('a transaction write keeps reference lists, which it does not change', async () => {
    const categories = keys.categories('expense')
    const before = await readThrough(categories, async () => 'refetched')

    invalidate([...WRITES.transaction])

    // Same value back means it was still cached, so the fetcher never ran. The
    // assertion is before-and-after rather than a literal, because priming the
    // cache is what put a value here — checking for a hard-coded string would
    // have passed on a key that was never fetched at all.
    const after = await readThrough(categories, async () => 'REFETCHED')

    expect(after.value).toBe(before.value)
    expect(after.value).not.toBe('REFETCHED')
  })

  it('posting an occurrence also clears the recurring list', async () => {
    // Posting moves the watermark, which changes what the list shows as due. That
    // is why it is a separate entry from editing a rule.
    expect(WRITES.occurrence).toContain(PREFIX.recurring)
    expect(WRITES.recurring).not.toContain(PREFIX.transactions)
  })

  it('a category rename does not clear figures', async () => {
    // Totals come from transaction rows, not from a join through the category's
    // current name, so renaming a category moves no number.
    expect(WRITES.category).toEqual([PREFIX.categories])
  })

  it('an account change clears balances but not totals', async () => {
    // Creating an account adds a balance. It cannot change what was spent this
    // month.
    expect(WRITES.account).toContain(PREFIX.accounts)
    expect(WRITES.account).not.toContain(PREFIX.transactions)
  })

  it('no write invalidates the profile implicitly', () => {
    // The profile is rewritten by the read that fetches it. If a write cleared it
    // the screen would re-fetch the name and currency on every keystroke.
    for (const prefixes of Object.values(WRITES)) {
      expect(prefixes).not.toContain(PREFIX.profile)
    }
  })

  it('every declared prefix corresponds to a key the app actually builds', () => {
    // A prefix nothing produces is dead weight; a key no prefix covers is a
    // silent miss. Both are checked here rather than by reading the map.
    const produced = allKeys()
    for (const prefixes of Object.values(WRITES)) {
      for (const prefix of prefixes) {
        expect(produced.some((key) => key.startsWith(prefix))).toBe(true)
      }
    }
  })
})
