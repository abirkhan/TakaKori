import { describe, expect, it } from 'vitest'
import { applyQueuedWrite, type WriteClient } from './applyQueued'
import { QUEUEABLE_KINDS, payloadFor } from './offlineWrites'
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

  it('treats a unique violation on the primary key as convergence, not failure', async () => {
    // The read said absent, the insert collided on _pkey: a stale read, or two drains
    // racing. Either way this identical row now exists, so this is success.
    //
    // **The constraint is named here, and naming it is the fix.** This test used to
    // assert convergence for a bare 23505 with no constraint, which is what the old
    // implementation assumed, and which silently discarded a queued category whose
    // name collided on categories_workspace_type_name_key. A 23505 is only convergence
    // when the server says it is the same row.
    const pkey = 'duplicate key value violates unique constraint "transactions_pkey"'
    const { client } = fakeClient({
      existing: { data: null },
      insert: { data: null, error: { code: '23505', message: pkey } },
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
    payload: { id: 'rule-1', occurrenceDate: '2026-11-05' },
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
/**
 * The empty-string invariant, and coverage of every kind at once.
 *
 * **These were written after I got something wrong.** Enabling `recurring.create`
 * required auditing its fields, and I expected to find that a queued rule with no end
 * date put `''` into a `date` column — `22007`, permanently, on every drain. I wrote a
 * guard and tests asserting the defect.
 *
 * Then I read `payloadFor`. It drops empty fields when it shapes a form into a row, so
 * an unfilled `endsOn` never reaches the payload and the column takes its default.
 * There was no defect. The guard in `applyQueued` stayed as a second line of defence
 * for a payload written by an older build, and these tests assert what is actually
 * true — including the upstream drop, which is the invariant worth pinning.
 */
describe('payloadFor — the upstream invariant', () => {
  /** A form carrying every field any kind might want, with the optional ones blank. */
  function blankForm(): FormData {
    const fd = new FormData()
    const fields: Record<string, string> = {
      id: '22222222-2222-4222-8222-222222222222',
      type: 'expense',
      amount: '100.00',
      accountId: '33333333-3333-4333-8333-333333333333',
      categoryId: '',
      counterpartyAccountId: '',
      occurredOn: '2026-10-09',
      description: '',
      name: '',
      kind: 'cash',
      openingBalance: '',
      intervalCount: '1',
      frequency: 'monthly',
      anchorDate: '2026-10-09',
      endsOn: '',
      occurrenceDate: '2026-10-09',
    }
    for (const [k, v] of Object.entries(fields)) fd.append(k, v)
    return fd
  }

  it('drops an unfilled optional field rather than storing an empty string', () => {
    // The real defence. `ends_on` is a `date`, so a queued `''` would be `22007`.
    const payload = payloadFor('recurring.create', blankForm())
    expect(payload).not.toBeNull()
    expect('ends_on' in payload!).toBe(false)
  })

  it('keeps a filled one', () => {
    const fd = blankForm()
    fd.set('endsOn', '2027-01-31')
    expect(payloadFor('recurring.create', fd)?.ends_on).toBe('2027-01-31')
  })

  it('drops an empty field for every kind that maps one', () => {
    // Not a spot check. A kind added later with a different shaping rule is exactly
    // the case this would miss.
    for (const kind of QUEUEABLE_KINDS) {
      const payload = payloadFor(kind, blankForm())
      expect(payload, `${kind} produced no payload`).not.toBeNull()
      const empties = Object.entries(payload!).filter(([, v]) => v === '')
      expect(empties.map(([k]) => k), `${kind} queued an empty string`).toEqual([])
    }
  })

  it('refuses a kind it cannot replay, rather than queueing it', () => {
    // The other half of the derivation: no mapping, no queue entry.
    expect(payloadFor('not.a.kind' as never, blankForm())).toBeNull()
  })
})

describe('every queueable kind', () => {
  /**
   * Offering to queue a write the drain cannot perform is the failure `QUEUEABLE_KINDS`
   * exists to prevent, and the derivation is only as good as the two lists agreeing.
   * Each kind is driven through the real shaping and the real replay together, so a
   * mapping to a column that does not exist — which would be a permanent failure on
   * every drain, invisible until one happens — is a failure here instead.
   */
  it('replays every kind the app offers to queue', async () => {
    const fd = new FormData()
    const fields: Record<string, string> = {
      id: '22222222-2222-4222-8222-222222222222',
      type: 'expense',
      amount: '100.00',
      accountId: '33333333-3333-4333-8333-333333333333',
      occurredOn: '2026-10-09',
      intervalCount: '1',
      frequency: 'monthly',
      anchorDate: '2026-10-09',
      occurrenceDate: '2026-10-09',
    }
    for (const [k, v] of Object.entries(fields)) fd.append(k, v)

    for (const kind of QUEUEABLE_KINDS) {
      const payload = payloadFor(kind, fd)
      expect(payload, `${kind} has no mapping`).not.toBeNull()
      const { client } = fakeClient({ existing: { data: null } })
      const result = await applyQueuedWrite(ctxFor(client), queued({ kind, payload: payload! }))
      expect(result.ok, `${kind} did not replay`).toBe(true)
    }
  })

  it('replays recurring.create with the fields RecurringForm actually renders', async () => {
    // Audited rather than assumed. `counterpartyAccountId` is deliberately absent:
    // `RecurringForm` never renders it, so mapping it would make the drain believe it
    // can populate something the form cannot produce.
    const fd = new FormData()
    for (const [k, v] of Object.entries({
      type: 'expense',
      amount: '2500.00',
      accountId: '33333333-3333-4333-8333-333333333333',
      categoryId: '44444444-4444-4444-8444-444444444444',
      frequency: 'monthly',
      intervalCount: '1',
      anchorDate: '2026-10-09',
    })) {
      fd.append(k, v)
    }

    const { client, calls } = fakeClient({ existing: { data: null } })
    const result = await applyQueuedWrite(
      ctxFor(client),
      queued({ kind: 'recurring.create', payload: payloadFor('recurring.create', fd)! }),
    )

    expect(result).toEqual({ ok: true })
    const insert = calls.find((c) => c.op === 'insert')?.arg as Record<string, unknown>
    expect(insert).toMatchObject({
      account_id: '33333333-3333-4333-8333-333333333333',
      category_id: '44444444-4444-4444-8444-444444444444',
      amount: '2500.00',
      frequency: 'monthly',
      interval_count: '1',
      anchor_date: '2026-10-09',
    })
    // Column names, not the form's camelCase. Passing camelCase keys straight to the
    // replay and concluding `ends_on` was missing is a mistake I made once already.
    expect(insert).not.toHaveProperty('accountId')
    expect(insert).not.toHaveProperty('anchorDate')
  })

  it('normalises a stray empty string to null rather than posting it', async () => {
    // Second line of defence. `payloadFor` drops empties today, but the payload is
    // durable data in IndexedDB written by whichever build queued it — an older record,
    // or a kind shaped differently later, could carry one. Against a `uuid` or `date`
    // column that is a permanent failure.
    const { client, calls } = fakeClient({ existing: { data: null } })
    await applyQueuedWrite(
      ctxFor(client),
      queued({ payload: { amount: '10.00', category_id: '', account_id: '' } }),
    )

    const insert = calls.find((c) => c.op === 'insert')?.arg as Record<string, unknown>
    expect(insert.category_id).toBeNull()
    expect(insert.account_id).toBeNull()
  })

  it('does not treat 0 or false as empty', async () => {
    // A truthiness test would null an `interval_count` of 0 and let the column default
    // mask an invalid value rather than rejecting it.
    const { client, calls } = fakeClient({ existing: { data: null } })
    await applyQueuedWrite(
      ctxFor(client),
      queued({ kind: 'recurring.create', payload: { interval_count: '0', ends_on: '' } }),
    )

    const insert = calls.find((c) => c.op === 'insert')?.arg as Record<string, unknown>
    expect(insert.interval_count).toBe('0')
    expect(insert.ends_on).toBeNull()
  })
})

/**
 * Which `23505` counts as convergence.
 *
 * **This distinction is load-bearing and getting it wrong loses a user's entry without
 * telling them.** `createRow` used to treat any unique violation as "already applied",
 * which is right for `transactions` — where the client-generated uuid is the only unique
 * index, so a collision can only mean this identical row is here — and catastrophically
 * wrong for `categories`, which has `categories_workspace_type_name_key`.
 *
 * Queue a category whose name is already taken and the insert raises `23505` on that
 * index. The old code read that as convergence, reported success, and removed the queued
 * write. Nothing was created, nothing was reported, and the entry stopped existing —
 * the exact failure ADR-043 exists to prevent, reached through the code written to
 * prevent it.
 *
 * Found by the offline E2E suite: the duplicate-category test waited forty seconds for a
 * parked row that could never appear, because the write had been silently discarded.
 */
describe('a unique violation on a non-primary index', () => {
  const conflict = {
    code: '23505',
    message:
      'duplicate key value violates unique constraint "categories_workspace_type_name_key"',
  }

  it('is reported, not treated as convergence', async () => {
    const { client } = fakeClient({ existing: { data: null }, insert: { data: null, error: conflict } })
    const result = await applyQueuedWrite(ctxFor(client), queued({
      kind: 'category.create',
      payload: { name: 'Food', type: 'expense' },
    }))

    expect(result.ok).toBe(false)
    // Permanently: a name that is taken will still be taken on the next drain, so
    // retrying burns a request per pass to learn nothing.
    expect(result.ok === false && result.retryable).toBe(false)
  })

  it('names what is wrong, in words the user can act on', async () => {
    const { client } = fakeClient({ existing: { data: null }, insert: { data: null, error: conflict } })
    const result = await applyQueuedWrite(ctxFor(client), queued({
      kind: 'category.create',
      payload: { name: 'Food', type: 'expense' },
    }))

    // "Another entry already uses that name" tells the user to rename something. The
    // constraint's own identifier would not, and a generic apology would not either.
    expect(result.ok === false && result.error).toMatch(/name/)
  })

  it('is a permanent failure, so the write parks instead of retrying forever', async () => {
    const { client } = fakeClient({ existing: { data: null }, insert: { data: null, error: conflict } })
    const result = await applyQueuedWrite(ctxFor(client), queued({
      kind: 'category.create',
      payload: { name: 'Food', type: 'expense' },
    }))
    expect(result.ok === false && result.retryable).toBe(false)
  })
})

describe('a unique violation on the primary key', () => {
  it('is still convergence, because that is the same row landing twice', async () => {
    const { client } = fakeClient({
      existing: { data: null },
      insert: {
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint "transactions_pkey"' },
      },
    })

    // The read above already asked by id and found nothing, so this means the read was
    // served stale — the race ADR-042's read-before-replay exists to absorb.
    const result = await applyQueuedWrite(ctxFor(client), queued())
    expect(result).toEqual({ ok: true })
  })

  it('is NOT convergence when the server does not say which constraint', async () => {
    const { client } = fakeClient({
      existing: { data: null },
      insert: { data: null, error: { code: '23505', message: 'duplicate key' } },
    })

    // No evidence it is the primary key, so the safe reading is a conflict. Defaulting
    // the other way would reintroduce the silent-loss bug for any server that phrases
    // its message differently — which is every future PostgREST version, possibly.
    const result = await applyQueuedWrite(ctxFor(client), queued())
    expect(result.ok).toBe(false)
  })
})
