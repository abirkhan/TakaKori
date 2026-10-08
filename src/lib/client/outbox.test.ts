import { beforeEach, describe, expect, it, vi } from 'vitest'
import { drain, enqueue, indexedDbOutbox, type ApplyFn, type QueuedWrite } from './outbox'
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