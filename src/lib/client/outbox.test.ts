import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  discardQueuedWrite,
  drain,
  enqueue,
  indexedDbOutbox,
  parkedWrites,
  retryQueuedWrite,
  type ApplyFn,
  type QueuedWrite,
} from './outbox'
import { idbAll, idbSet } from './idb'

vi.mock('./idb', () => ({
  idbAll: vi.fn(),
  idbSet: vi.fn(),
  idbDelete: vi.fn(),
}))

const idbAllMock = vi.mocked(idbAll)
const idbSetMock = vi.mocked(idbSet)

/** An in-memory store, so `drain` can be tested without IndexedDB. */
function memoryStore(initial: QueuedWrite[] = []) {
  const rows = new Map(initial.map((r) => [r.id, r]))
  return {
    rows,
    store: {
      all: async () => Array.from(rows.values()),
      put: async (w: QueuedWrite) => {
        rows.set(w.id, w)
        return true
      },
      remove: async (id: string) => {
        rows.delete(id)
      },
    },
  }
}

function write(over: Partial<QueuedWrite> = {}): QueuedWrite {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'transaction.create' as const,
    payload: { amount: '200.00' },
    queuedAt: 1_000,
    status: 'queued',
    attempts: 0,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('enqueue', () => {
  it('stores a write as queued with no attempts', async () => {
    const { store, rows } = memoryStore()
    const ok = await enqueue(write(), store)

    expect(ok).toBe(true)
    expect(rows.get(write().id)).toMatchObject({ status: 'queued', attempts: 0 })
  })

  it('keeps the client-generated id, because that is the replay key', async () => {
    // ADR-042: replaying under a new id writes a second row. The id has to survive
    // serialisation untouched or the whole feature duplicates entries instead.
    const { store, rows } = memoryStore()
    const id = 'c0ffee00-0000-4000-8000-000000000001'
    await enqueue(write({ id }), store)

    expect(rows.get(id)?.id).toBe(id)
  })

  it('reports failure rather than failing soft, so the caller cannot lie', async () => {
    // ADR-043. A cache may fail soft; a queued write may not, or the app confirms a
    // save that never happened.
    const failing = {
      all: async () => [],
      put: async () => false,
      remove: async () => {},
    }

    expect(await enqueue(write(), failing)).toBe(false)
  })
})

describe('the IndexedDB adapter', () => {
  it('treats a key returned from put as stored', async () => {
    idbSetMock.mockResolvedValue('some-key')
    expect(await indexedDbOutbox.put(write())).toBe(true)
  })

  it('treats null from put as NOT stored', async () => {
    // This is the entire contract between the outbox and a fail-soft cache: an IDB
    // `put` resolves with the key on success and `null` on failure, so null means
    // the record is gone and the user must not be told it was saved.
    idbSetMock.mockResolvedValue(null)
    expect(await indexedDbOutbox.put(write())).toBe(false)
  })

  it('drops rows with no id, which would otherwise replay as undefined', async () => {
    idbAllMock.mockResolvedValue([
      write({ id: 'good' }),
      { kind: 'transaction.create' } as unknown as QueuedWrite,
    ])
    const rows = await indexedDbOutbox.all()

    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('good')
  })
})

describe('drain', () => {
  it('does nothing at all when nothing is queued', async () => {
    const { store } = memoryStore()
    const apply = vi.fn()

    const result = await drain(apply, store)

    expect(apply).not.toHaveBeenCalled()
    expect(result).toEqual({ applied: 0, failed: 0, remaining: 0, stopped: false })
  })

  it('removes a write the database applied', async () => {
    const { store, rows } = memoryStore([write()])
    const apply: ApplyFn = async () => ({ ok: true })

    const result = await drain(apply, store)

    expect(rows.size).toBe(0)
    expect(result.applied).toBe(1)
  })

  it('treats already-applied as success, because ADR-042 makes them the same thing', async () => {
    // `apply` cannot tell the caller which it was, and must not need to: a queued
    // write succeeds when the database is already in the state it asked for.
    const { store, rows } = memoryStore([write()])

    const result = await drain(async () => ({ ok: true }), store)

    expect(result.applied).toBe(1)
    expect(rows.size).toBe(0)
  })

  it('replays in the order the writes were made', async () => {
    const { store } = memoryStore([
      write({ id: 'c', queuedAt: 300 }),
      write({ id: 'a', queuedAt: 100 }),
      write({ id: 'b', queuedAt: 200 }),
    ])
    const seen: string[] = []

    await drain(async (w) => {
      seen.push(w.id)
      return { ok: true }
    }, store)

    expect(seen).toEqual(['a', 'b', 'c'])
  })

  it('keeps a permanently failed write, with the real reason, and carries on', async () => {
    // A duplicate category name will never succeed on its own. It must be recorded
    // and stepped over, not retried forever and not silently discarded.
    const { store, rows } = memoryStore([write({ id: 'bad' }), write({ id: 'good' })])
    const apply: ApplyFn = async (w) =>
      w.id === 'bad'
        ? { ok: false, error: 'You already have an expense category called "Food".', retryable: false }
        : { ok: true }

    const result = await drain(apply, store)

    expect(result).toMatchObject({ applied: 1, failed: 1, stopped: false })
    expect(rows.get('bad')).toMatchObject({
      status: 'failed',
      failure: 'You already have an expense category called "Food".',
      attempts: 1,
    })
    expect(rows.has('good')).toBe(false)
  })

  it('stops on a retryable failure instead of failing every remaining write', async () => {
    // The reason `retryable` exists. Ten writes queued offline into a dead
    // connection must not become ten requests that each hang until they time out.
    const writes = Array.from({ length: 10 }, (_, i) => write({ id: `w${i}`, queuedAt: i }))
    const { store, rows } = memoryStore(writes)
    const apply = vi.fn(async () => ({ ok: false, error: 'No connection.', retryable: true }))

    const result = await drain(apply, store)

    expect(apply).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ applied: 0, failed: 1, remaining: 9, stopped: true })
    expect(rows.size).toBe(10)
  })

  it('leaves writes behind a retryable failure queued, not failed', async () => {
    // They were never attempted. Marking them failed would tell the user something
    // about rows the server never saw.
    const { store, rows } = memoryStore([write({ id: 'first' }), write({ id: 'second' })])

    await drain(async (w) => (w.id === 'first' ? { ok: false, error: 'No connection.', retryable: true } : { ok: true }), store)

    expect(rows.get('second')).toMatchObject({ status: 'queued', attempts: 0 })
  })

  it('counts attempts so a repeatedly failing write is visible as such', async () => {
    const { store, rows } = memoryStore([write({ attempts: 2 })])

    await drain(async () => ({ ok: false, error: 'Nope.', retryable: false }), store)

    expect(rows.get(write().id)?.attempts).toBe(3)
  })

  it('does not resurrect a write it already dropped in an earlier pass', async () => {
    const { store, rows } = memoryStore([write()])
    await drain(async () => ({ ok: true }), store)
    const second = await drain(async () => ({ ok: true }), store)

    expect(second.applied).toBe(0)
    expect(rows.size).toBe(0)
  })
})
/**
 * Parking, and the two ways out.
 *
 * **This was a dead end and it is the reason these exist.** A queued write the server
 * permanently rejects kept its place in the queue — which is right, because dropping it
 * silently is the failure ADR-043 is against — and `drain` attempted it on every pass.
 * So a category name that was already taken was re-sent on every app open and every
 * `online` event, failed identically, and incremented `attempts` forever. The row stayed
 * visible with the honest reason and no way to act on it. There was no retry and no
 * discard, because the module exported only `enqueue` and `drain`.
 *
 * Two fixes, and the first is the one that actually changes the behaviour: the store now
 * records *whether* a failure was permanent, because a dropped connection and a
 * duplicate name arrive identically and must not be treated identically. The second is
 * that a parked write is skipped until the user says otherwise.
 */
describe('parked writes', () => {
  it('does not re-attempt a permanently failed write', async () => {
    // The core of it: this row has already failed permanently, and the drain used to
    // send it again on every pass, failing the same way forever.
    const { store, rows } = memoryStore([
      write({ id: 'parked', status: 'failed', permanentFailure: true, attempts: 4 }),
    ])
    let called = 0
    const apply: ApplyFn = async () => {
      called += 1
      return { ok: true }
    }

    const result = await drain(apply, store)

    expect(called).toBe(0)
    // Still held. "Not attempted" must never read as "gone".
    expect(rows.size).toBe(1)
    expect(result).toMatchObject({ applied: 0, failed: 0, remaining: 1 })
  })

  it('counts a parked row as remaining, not as a fresh failure', async () => {
    // Reporting a permanent failure that did not happen during this pass is the kind of
    // number that is defensible and completely misleading.
    const { store } = memoryStore([
      write({ id: 'p1', status: 'failed', permanentFailure: true, queuedAt: 1 }),
      write({ id: 'p2', status: 'failed', permanentFailure: true, queuedAt: 2 }),
      write({ id: 'ok', queuedAt: 3 }),
    ])

    const result = await drain(async () => ({ ok: true }), store)
    expect(result).toMatchObject({ applied: 1, failed: 0, remaining: 2, stopped: false })
  })

  it('still attempts a transiently failed write', async () => {
    // A dropped connection must auto-retry. Skipping these would strand every write
    // made during an outage until the user noticed and pressed something.
    const { store, rows } = memoryStore([
      write({ id: 't1', status: 'failed', permanentFailure: false, attempts: 2 }),
    ])

    const result = await drain(async () => ({ ok: true }), store)
    expect(rows.size).toBe(0)
    expect(result.applied).toBe(1)
  })

  it('does not block a healthy write that sits behind a parked one', async () => {
    // Ordering is by `queuedAt` and a parked row is usually older. If parking stopped
    // the pass, everything recorded after a conflict would be stuck behind it.
    const { store } = memoryStore([
      write({ id: 'old-parked', queuedAt: 1, status: 'failed', permanentFailure: true }),
      write({ id: 'new-ok', queuedAt: 2 }),
    ])
    const attempted: string[] = []

    await drain(async (w) => {
      attempted.push(w.id)
      return { ok: true }
    }, store)

    expect(attempted).toEqual(['new-ok'])
  })

  it('records the flag on a permanent failure, and not on a transient one', async () => {
    // Without this the two are indistinguishable on the next pass, which is the whole
    // problem: one must auto-retry and one must not.
    const { store, rows } = memoryStore([write({ id: 'a', queuedAt: 1 }), write({ id: 'b', queuedAt: 2 })])
    await drain(async (w) =>
      w.id === 'a'
        ? { ok: false, error: 'duplicate', retryable: false }
        : { ok: false, error: 'network', retryable: true },
    store)

    expect(rows.get('a')?.permanentFailure).toBe(true)
    expect(rows.get('b')?.permanentFailure).toBe(false)
  })

  it('clears a stale flag when a retried write fails transiently instead', async () => {
    // Otherwise one dropped connection re-parks it forever, and the user is back to a
    // row that cannot move.
    const { store, rows } = memoryStore([
      write({ id: 'x', status: 'failed', permanentFailure: true, failure: 'duplicate' }),
    ])
    await retryQueuedWrite('x', {}, store)
    await drain(async () => ({ ok: false, error: 'network', retryable: true }), store)

    expect(rows.get('x')?.permanentFailure).toBe(false)
  })

  it('selects the parked set for the UI, and only that set', () => {
    const rows = [
      write({ id: 'a', status: 'failed', permanentFailure: true }),
      write({ id: 'b', status: 'failed', permanentFailure: false }),
      write({ id: 'c', status: 'queued' }),
    ]
    expect(parkedWrites(rows).map((w) => w.id)).toEqual(['a'])
    expect(parkedWrites([write()])).toEqual([])
  })
})

describe('retryQueuedWrite', () => {
  it('clears the flag, so the next drain attempts it', async () => {
    const { store } = memoryStore([write({ id: 'p', status: 'failed', permanentFailure: true })])
    await retryQueuedWrite('p', {}, store)

    let called = 0
    await drain(async () => {
      called += 1
      return { ok: true }
    }, store)
    expect(called).toBe(1)
  })

  it('clears the failure message', async () => {
    // A stale reason beside a row now waiting reads as the app contradicting itself on
    // one line.
    const { store, rows } = memoryStore([
      write({ id: 'p', status: 'failed', permanentFailure: true, failure: 'duplicate' }),
    ])
    await retryQueuedWrite('p', {}, store)
    expect(rows.get('p')?.failure).toBeUndefined()
  })

  it('merges a corrected value into the payload', async () => {
    // The reason `patch` exists. Replaying a write that failed because its name was
    // taken, unchanged, fails for the same reason: the user renames the category in
    // the app and the queued payload still carries the old name. Without this, "Try
    // again" is a button that fails identically forever — worse than no button,
    // because it looks like progress.
    const { store, rows } = memoryStore([
      write({
        id: 'p',
        kind: 'category.create',
        payload: { name: 'Food', type: 'expense' },
        permanentFailure: true,
      }),
    ])
    await retryQueuedWrite('p', { name: 'Eating out' }, store)
    expect(rows.get('p')?.payload).toEqual({ name: 'Eating out', type: 'expense' })
  })

  it('keeps the id, so a retry converges instead of duplicating', async () => {
    // The id is the idempotency key (ADR-042). A new one here would be a second row.
    const { store, rows } = memoryStore([write({ id: 'p', permanentFailure: true })])
    await retryQueuedWrite('p', { name: 'New' }, store)
    expect(rows.get('p')?.id).toBe('p')
  })

  it('reports false for an id that is not queued', async () => {
    // A stale retry from a stale UI must not reappear as a brand new entry.
    const { store, rows } = memoryStore([write({ id: 'here' })])
    expect(await retryQueuedWrite('gone', {}, store)).toBe(false)
    expect(rows.size).toBe(1)
  })
})

describe('discardQueuedWrite', () => {
  it('removes a parked write', async () => {
    const { store, rows } = memoryStore([write({ id: 'p', permanentFailure: true })])
    expect(await discardQueuedWrite('p', store)).toBe(true)
    expect(rows.size).toBe(0)
  })

  it('removes a waiting write too', async () => {
    // Otherwise "discard" appears to work only on failures, and a user who mistyped an
    // offline entry has no way to undo it.
    const { store, rows } = memoryStore([write({ id: 'w' })])
    expect(await discardQueuedWrite('w', store)).toBe(true)
    expect(rows.size).toBe(0)
  })

  it('reports false for an unknown id, so a double tap cannot lie', async () => {
    const { store } = memoryStore([write({ id: 'a' })])
    expect(await discardQueuedWrite('a', store)).toBe(true)
    expect(await discardQueuedWrite('a', store)).toBe(false)
  })

  it('leaves the rest of the queue alone', async () => {
    const { store, rows } = memoryStore([write({ id: 'a', queuedAt: 1 }), write({ id: 'b', queuedAt: 2 })])
    await discardQueuedWrite('a', store)
    expect([...rows.keys()]).toEqual(['b'])
  })
})
