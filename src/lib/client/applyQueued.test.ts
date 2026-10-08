import { describe, expect, it } from 'vitest'
import { applyQueuedWrite, type WriteClient } from './applyQueued'
import type { QueuedWrite } from './outbox'

/**
 * These cover convergence, because that is the only thing this module has to get
 * right. Everything else - the payload, the workspace, the error text - is ordinary
 * database work, and getting it wrong shows up as a bug that is visible and
 * recoverable rather than as a duplicated financial record.
 *
 * The database behaviour this relies on was verified against the real table before
 * any of it was written: an explicit client uuid inserts, the same uuid twice is
 * rejected naming `transactions_pkey`, the row count stays at 1, and the rejected
 * insert does not overwrite the row.
 */

function queued(over: Partial<QueuedWrite> = {}): QueuedWrite {
  return {
    id: 'a1a1a1a1-0000-4000-8000-000000000001',
    kind: 'transaction.create',
    payload: { amount: '200.00', type: 'expense', account_id: 'acc-1' },
    queuedAt: 1_000,
    status: 'queued',
    attempts: 0,
    ...over,
  }
}

/** Records what the client was asked, so the tests can assert on the write itself. */
function fakeClient(behaviour: {
  existing?: { data: { id: string } | null; error?: unknown }
  insert?: { data: { id: string } | null; error?: unknown }
}) {
  const calls: { op: string; arg?: unknown }[] = []

  const client: WriteClient = {
    from(table: string) {
      const builder = {
        select() {
          return {
            eq(_column: string, value: unknown) {
              calls.push({ op: 'read', arg: value })
              return {
                async maybeSingle() {
                  return behaviour.existing ?? { data: null, error: null }
                },
              }
            },
          }
        },
        insert(row: Record<string, unknown>) {
          calls.push({ op: 'insert', arg: row })
          return {
            select() {
              return {
                async single() {
                  return behaviour.insert ?? { data: { id: 'x' }, error: null }
                },
              }
            },
          }
        },
      }
      calls.push({ op: 'from', arg: table })
      return builder
    },
  }

  return { client, calls }
}

const ctxFor = (client: WriteClient) => ({ supabase: client, workspaceId: 'ws-1' })

describe('applyQueuedWrite - transaction.create', () => {
  it('inserts when the row is not already there', async () => {
    const { client, calls } = fakeClient({ existing: { data: null } })

    const result = await applyQueuedWrite(ctxFor(client), queued())

    expect(result).toEqual({ ok: true })
    // Two builders, because a read and an insert are separate queries.
    expect(calls.map((c) => c.op).filter((op) => op === 'read' || op === 'insert')).toEqual([
      'read',
      'insert',
    ])
  })

  it('sends the queued uuid as the row id, so replay is identifiable', async () => {
    // The id is generated in the browser when the user presses save and is the only
    // thing that makes "did this already land?" answerable. If it were dropped here,
    // a replay would write a second row.
    const { client, calls } = fakeClient({ existing: { data: null } })
    const write = queued()

    await applyQueuedWrite(ctxFor(client), write)

    const insert = calls.find((c) => c.op === 'insert')
    expect((insert?.arg as Record<string, unknown>).id).toBe(write.id)
  })

  it('takes the workspace from context, never from the payload', async () => {
    // RLS would reject a foreign workspace anyway, but the app should not be relying
    // on the database to discover it sent the wrong one.
    const { client, calls } = fakeClient({ existing: { data: null } })

    await applyQueuedWrite(ctxFor(client), queued({ payload: { amount: '1.00', workspace_id: 'someone-elses' } }))

    const insert = calls.find((c) => c.op === 'insert')
    expect((insert?.arg as Record<string, unknown>).workspace_id).toBe('ws-1')
  })

  it('reads by id before writing, rather than relying on the insert to fail', async () => {
    const { client, calls } = fakeClient({ existing: { data: null } })
    await applyQueuedWrite(ctxFor(client), queued())

    expect(calls[1]).toEqual({ op: 'read', arg: queued().id })
  })

  it('treats an already-present row as success, and does not insert again', async () => {
    // The case the whole design exists for: this queued write already landed on an
    // earlier pass. Reporting failure would leave it in the queue forever; inserting
    // would duplicate it.
    const { client, calls } = fakeClient({ existing: { data: { id: queued().id } } })

    const result = await applyQueuedWrite(ctxFor(client), queued())

    expect(result).toEqual({ ok: true })
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('treats a unique violation as convergence, not failure', async () => {
    // The read said absent, the insert collided: a stale read, or two drains racing.
    // Either way the row now exists, so this is success.
    const { client } = fakeClient({
      existing: { data: null },
      insert: { data: null, error: { code: '23505' } },
    })

    expect(await applyQueuedWrite(ctxFor(client), queued())).toEqual({ ok: true })
  })

  it('stops the drain when the read fails, rather than inserting blind', async () => {
    // A failed read says nothing about whether the row is there. Inserting anyway is
    // how a duplicate happens.
    const { client, calls } = fakeClient({ existing: { data: null, error: { code: '08006' } } })

    const result = await applyQueuedWrite(ctxFor(client), queued())

    expect(result).toMatchObject({ ok: false, retryable: true })
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('reports a shape violation as permanent, rather than swallowing it', async () => {
    // 23514 is the transactions shape CHECK. Retrying it would loop forever and hide
    // a real bug behind a permanently failed row.
    const { client } = fakeClient({
      existing: { data: null },
      insert: { data: null, error: { code: '23514' } },
    })

    const result = await applyQueuedWrite(ctxFor(client), queued())

    expect(result).toMatchObject({ ok: false, retryable: false })
  })

  it('does not claim success for a write kind it cannot replay', async () => {
    const { client, calls } = fakeClient({ existing: { data: null } })

    const result = await applyQueuedWrite(ctxFor(client), queued({ kind: 'transaction.delete' }))

    expect(result).toMatchObject({ ok: false, retryable: false })
    expect(calls).toHaveLength(0)
  })

  it('never upserts, because an upsert would revert a later edit', async () => {
    const { client, calls } = fakeClient({ existing: { data: null } })
    await applyQueuedWrite(ctxFor(client), queued())

    expect(calls.some((c) => c.op === 'upsert')).toBe(false)
  })

  it('leaves the queued write untouched, since the drain owns its bookkeeping', async () => {
    const write = queued()
    const { client } = fakeClient({ existing: { data: null } })

    await applyQueuedWrite(ctxFor(client), write)

    expect(write.attempts).toBe(0)
    expect(write.status).toBe('queued')
  })
})