import { describe, expect, it, vi } from 'vitest'
import { failedWrites } from './useQueuedWrites'
import type { OutboxStore, QueuedWrite } from './outbox'

function write(over: Partial<QueuedWrite> = {}): QueuedWrite {
  return {
    id: 'w1',
    kind: 'transaction.create',
    payload: { amount: '200.00' },
    queuedAt: 1_000,
    status: 'queued',
    attempts: 0,
    ...over,
  }
}

describe('failedWrites', () => {
  it('is empty for a queue of ordinary pending writes', () => {
    expect(failedWrites([write(), write({ id: 'w2' })])).toHaveLength(0)
  })

  it('separates the rows the server refused from the ones merely waiting', () => {
    // The distinction the UI turns on. A row the server has already rejected is not
    // "waiting to sync"; it will never sync, and showing it as waiting is a lie
    // with a countdown on it.
    const rows = [write(), write({ id: 'w2', status: 'failed', failure: 'Duplicate.' })]

    expect(failedWrites(rows).map((w) => w.id)).toEqual(['w2'])
  })

  it('carries the reason through, since it is the only thing that can help', () => {
    const [failed] = failedWrites([write({ status: 'failed', failure: 'You already have one.' })])

    expect(failed?.failure).toBe('You already have one.')
  })

  it('treats a queue with nothing in it as nothing to show', () => {
    expect(failedWrites([])).toEqual([])
  })
})

describe('the outbox subscription', () => {
  it('notifies subscribers when a write is stored', async () => {
    const { subscribeToOutbox } = await import('./outbox')
    const listener = vi.fn()

    const unsubscribe = subscribeToOutbox(listener)
    const { enqueue } = await import('./outbox')
    const store: OutboxStore = {
      all: async () => [],
      put: async () => true,
      remove: async () => {},
    }

    await enqueue(write(), store)
    unsubscribe()

    // A queued write is the only record the server has not seen. If nothing
    // re-reads the queue the entry is invisible, and invisible entries read as lost.
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after unsubscribe', async () => {
    const { subscribeToOutbox, enqueue } = await import('./outbox')
    const listener = vi.fn()
    const store: OutboxStore = {
      all: async () => [],
      put: async () => true,
      remove: async () => {},
    }

    const unsubscribe = subscribeToOutbox(listener)
    unsubscribe()
    await enqueue(write({ id: 'w9' }), store)

    expect(listener).not.toHaveBeenCalled()
  })

  it('announces when the queue empties, so a pending row stops saying "waiting"', async () => {
    // Announcing only on the way *into* a drain means a subscriber re-reads while
    // every row is still queued, and nothing announces again - so the label survives
    // a successful sync forever, which teaches users it is decoration.
    const { subscribeToOutbox, drain } = await import('./outbox')
    const listener = vi.fn()
    const store: OutboxStore = {
      all: async () => [write()],
      put: async () => true,
      remove: async () => {},
    }

    const unsubscribe = subscribeToOutbox(listener)
    await drain(async () => ({ ok: true }), store)
    unsubscribe()

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not announce a write that could not be stored', async () => {
    // Nothing changed, so there is nothing for a subscriber to notice — and the
    // caller is about to render an error rather than a pending row.
    const { subscribeToOutbox, enqueue } = await import('./outbox')
    const listener = vi.fn()
    const store: OutboxStore = {
      all: async () => [],
      put: async () => false,
      remove: async () => {},
    }

    const unsubscribe = subscribeToOutbox(listener)
    await enqueue(write(), store)
    unsubscribe()

    expect(listener).not.toHaveBeenCalled()
  })
})