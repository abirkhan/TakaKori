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
  remove?: { data: unknown; error?: unknown }
  update?: { data: unknown; error?: unknown }
  rpc?: { data: unknown; error?: unknown }
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
        update(row: Record<string, unknown>) {
          calls.push({ op: 'update', arg: row })
          const chain = {
            eq(_column: string, value: unknown) {
              calls.push({ op: 'eq', arg: value })
              return chain
            },
            then<A, B>(
              onOk?: ((v: { data: unknown; error?: unknown }) => A | PromiseLike<A>) | null,
              onErr?: ((e: unknown) => B | PromiseLike<B>) | null,
            ) {
              return Promise.resolve(behaviour.update ?? { data: [], error: null }).then(
                onOk,
                onErr,
              )
            },
          }
          return chain
        },
        delete() {
          calls.push({ op: 'delete' })
          // Supabase's builders are thenable, so the chain is the promise. Modelled
          // the same way here, or the fake would not be exercising the real shape.
          const chain = {
            eq(_column: string, value: unknown) {
              calls.push({ op: 'eq', arg: value })
              return chain
            },
            then<A, B>(
              onOk?: ((v: { data: unknown; error?: unknown }) => A | PromiseLike<A>) | null,
              onErr?: ((e: unknown) => B | PromiseLike<B>) | null,
            ) {
              return Promise.resolve(behaviour.remove ?? { data: [], error: null }).then(
                onOk,
                onErr,
              )
            },
          }
          return chain
        },
      }
      calls.push({ op: 'from', arg: table })
      return builder
    },
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ op: 'rpc', arg: { fn, args } })
      return Promise.resolve(behaviour.rpc ?? { data: 'tx-id', error: null })
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

  it('reads a category by its queued id, so a replayed category cannot duplicate', async () => {
    // The other creates are the same operation against a different table. The unique
    // index on (workspace, type, lower(name)) makes a genuine duplicate *fail*, which
    // is the right outcome — but only if the replay is detected by id first, because
    // otherwise a replayed category reports "you already have a category called
    // Food" as though the user had done it twice.
    const { client, calls } = fakeClient({ existing: { data: null } })

    await applyQueuedWrite(ctxFor(client), queued({ kind: 'category.create' }))

    expect(calls[1]).toEqual({ op: 'read', arg: queued().id })
  })
})

describe('applyQueuedWrite - updates and occurrences', () => {
  const edit = (payload: Record<string, unknown> = { id: 'row-1', amount: '99.00' }) =>
    queued({ kind: 'transaction.update', payload })

  it('updates by id without reading first', async () => {
    // Writing a row the values it already holds changes nothing, so a replayed edit
    // is a no-op rather than a second write. No read needed to know that.
    const { client, calls } = fakeClient({})

    expect(await applyQueuedWrite(ctxFor(client), edit())).toEqual({ ok: true })
    expect(calls.some((c) => c.op === 'read')).toBe(false)
  })

  it('never sends the id as a column, so an edit cannot move the row', async () => {
    const { client, calls } = fakeClient({})

    await applyQueuedWrite(ctxFor(client), edit())

    expect(calls.find((c) => c.op === 'update')?.arg).toEqual({ amount: '99.00' })
  })

  it('filters on id and workspace, always', async () => {
    const { client, calls } = fakeClient({})

    await applyQueuedWrite(ctxFor(client), edit())

    expect(calls.filter((c) => c.op === 'eq').map((c) => c.arg)).toEqual(['row-1', 'ws-1'])
  })

  it('refuses an edit with no id rather than issuing an unfiltered update', async () => {
    const { client, calls } = fakeClient({})

    const result = await applyQueuedWrite(ctxFor(client), edit({ amount: '1.00' }))

    expect(result).toMatchObject({ ok: false, retryable: false })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  const occurrence = queued({
    kind: 'occurrence.post',
    payload: { recurringId: 'rule-1', occurrenceDate: '2026-11-05' },
  })

  it('posts an occurrence through the database function', async () => {
    const { client, calls } = fakeClient({})

    expect(await applyQueuedWrite(ctxFor(client), occurrence)).toEqual({ ok: true })
    expect(calls[0]).toEqual({
      op: 'rpc',
      arg: {
        fn: 'post_recurring_occurrence',
        args: { target_recurring_id: 'rule-1', occurrence_date: '2026-11-05' },
      },
    })
  })

  it("treats the watermark's already-posted as convergence", async () => {
    // The one kind that needed no read-before-replay: the database's own
    // last_posted_on watermark raises 23505, which *is* the already-applied signal,
    // atomically, under a row lock.
    const { client } = fakeClient({ rpc: { data: null, error: { code: '23505' } } })

    expect(await applyQueuedWrite(ctxFor(client), occurrence)).toEqual({ ok: true })
  })

  it('still reports a date that is not a real occurrence as a failure', async () => {
    // 23514 is the schedule check. Only the watermark's 23505 means "already done",
    // so treating every 23505 as success would swallow a genuine rejection.
    const { client } = fakeClient({ rpc: { data: null, error: { code: '23514' } } })

    expect(await applyQueuedWrite(ctxFor(client), occurrence)).toMatchObject({
      ok: false,
      retryable: false,
    })
  })
})

describe('applyQueuedWrite - deletes', () => {
  const deleteOf = (id: string) => queued({ kind: 'transaction.delete', payload: { id } })

  it('deletes by id', async () => {
    const { client, calls } = fakeClient({})

    const result = await applyQueuedWrite(ctxFor(client), deleteOf('row-1'))

    expect(result).toEqual({ ok: true })
    expect(calls.filter((c) => c.op === 'delete')).toHaveLength(1)
  })

  it('filters on workspace_id as well as id, always', async () => {
    // The AGENTS.md rule is `id`; `workspace_id` is belt and braces, matching what the
    // Server Actions do. PostgREST matches *every* row when a filter is missing.
    const { client, calls } = fakeClient({})

    await applyQueuedWrite(ctxFor(client), deleteOf('row-1'))

    const filters = calls.filter((c) => c.op === 'eq').map((c) => c.arg)
    expect(filters).toEqual(['row-1', 'ws-1'])
  })

  it('does not read first, because deleting zero rows is not an error', async () => {
    // This is the whole reason a delete converges on the first replay with nothing to
    // reconcile. A read would be an extra round trip per queued delete to learn
    // something the response already says.
    const { client, calls } = fakeClient({})

    await applyQueuedWrite(ctxFor(client), deleteOf('row-1'))

    expect(calls.some((c) => c.op === 'read')).toBe(false)
  })

  it('treats an already-absent row as success', async () => {
    const { client } = fakeClient({ remove: { data: [], error: null } })

    expect(await applyQueuedWrite(ctxFor(client), deleteOf('gone'))).toEqual({ ok: true })
  })

  it('reports a rejected delete as permanent rather than retrying it forever', async () => {
    const { client } = fakeClient({ remove: { data: null, error: { code: '42501' } } })

    expect(await applyQueuedWrite(ctxFor(client), deleteOf('row-1'))).toMatchObject({
      ok: false,
      retryable: false,
    })
  })

  it('refuses a delete with no id rather than issuing an unfiltered statement', async () => {
    // The failure this guards is the one AGENTS.md calls out: no `.eq('id')` means
    // PostgREST deletes every row it can see.
    const { client, calls } = fakeClient({})

    const result = await applyQueuedWrite(ctxFor(client), deleteOf(''))

    expect(result).toMatchObject({ ok: false, retryable: false })
    expect(calls.some((c) => c.op === 'delete')).toBe(false)
  })

  it('deletes a budget and a rule from their own tables', async () => {
    const budget = fakeClient({})
    await applyQueuedWrite(
      ctxFor(budget.client),
      queued({ kind: 'budget.delete', payload: { id: 'b1' } }),
    )
    expect(budget.calls[0]).toEqual({ op: 'from', arg: 'budgets' })

    const rule = fakeClient({})
    await applyQueuedWrite(
      ctxFor(rule.client),
      queued({ kind: 'recurring.delete', payload: { id: 'r1' } }),
    )
    expect(rule.calls[0]).toEqual({ op: 'from', arg: 'recurring_transactions' })
  })
})