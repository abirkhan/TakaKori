'use client'

/**
 * The outbox: writes made while offline, waiting to be replayed.
 *
 * **What this is for.** A user on a metered connection records a 200 taka expense
 * in a lift. Without this, the write is refused and the entry is gone. With it, the
 * write is stored on the device and replayed when there is a signal.
 *
 * **The policy this implements is ADR-042**: a queued write succeeds when the
 * database is already in the state it asked for. Converging is the drain's job —
 * this module never decides whether a write *should* happen, only that it is
 * attempted exactly once per pass and never twice for the same queued record.
 *
 * **Why it does not fail soft like the cache does.** `idb.ts` fails soft on
 * purpose and its reasoning is right for a cache: losing it means "fetch again".
 * For a queued write, losing it means the user's money vanished while the app said
 * it was fine — which is the one thing this feature exists to prevent. So `enqueue`
 * reports whether the record was actually stored, and the caller decides what to
 * tell the user. See ADR-043.
 *
 * **The store is injected, not imported.** That is what makes `drain` testable
 * without IndexedDB, which is the only place the interesting behaviour lives: what
 * happens to the queue when one write fails and the next one would succeed.
 */

import { idbAll, idbDelete, idbSet } from './idb'

/**
 * One queued write.
 *
 * `id` is the client-generated uuid from ADR-042 — it is the row id for a create,
 * and therefore the idempotency key that makes replay converge. It must survive
 * serialisation untouched: a replay under a *new* id is a second row, which is the
 * bug ADR-042 exists to prevent.
 *
 * `payload` is plain JSON, never `FormData`. The Server Actions take `FormData`;
 * an outbox row has to outlive a reload and be readable by code that did not build
 * it, and `FormData` is neither.
 */
export interface QueuedWrite {
  /** Client-generated uuid. The row id for a create, so replay converges. */
  id: string
  kind: QueuedWriteKind
  payload: Record<string, unknown>
  /** When the user pressed save, in epoch ms. Drains replay in this order. */
  queuedAt: number
  /** `failed` means the drain tried and the write was rejected. */
  status: 'queued' | 'failed'
  /** Why it failed. Only ever shown when `status` is `failed`. */
  failure?: string
  attempts: number
}

/**
 * Every write that can be queued.
 *
 * A closed union on purpose: the drain's `apply` is the one place that has to know
 * what each kind means, and a closed set means adding a write forces that place to
 * be updated rather than silently falling through. All ten, including deletes —
 * ADR-042 explains why a queued delete is safe and what "already gone" means.
 */
export type QueuedWriteKind =
  | 'transaction.create'
  | 'transaction.update'
  | 'transaction.delete'
  | 'account.create'
  | 'category.create'
  | 'budget.create'
  | 'budget.delete'
  | 'recurring.create'
  | 'recurring.delete'
  | 'occurrence.post'

/**
 * What happened to one queued write.
 *
 * Returned rather than thrown, because the drain has to distinguish *which* failure
 * occurred and a rejection carries that awkwardly through a retry loop.
 */
export type ApplyResult =
  | { ok: true }
  | {
      ok: false
      /** Shown to the user, or to nobody if they are offline and it is transient. */
      error: string
      /**
       * Whether trying again could plausibly succeed.
       *
       * This is the distinction ADR-043 turns on: a duplicate category name will
       * never succeed on its own, so the drain marks it failed with the real reason
       * and carries on; a network error will fail every remaining row too, so the
       * drain stops rather than firing one doomed request per queued write.
       */
      retryable: boolean
    }

/** Applies one write. Must converge — see ADR-042. */
export type ApplyFn = (write: QueuedWrite) => Promise<ApplyResult>

/**
 * The persistence this module needs.
 *
 * Deliberately narrower than `idb.ts` gives it: `put` reports whether the record
 * was actually stored. `idb.ts` stays fail-soft for its other caller, and the
 * outbox refuses to inherit that.
 */
export interface OutboxStore {
  all(): Promise<QueuedWrite[]>
  /** Resolves false when the record could not be stored. Never rejects. */
  put(write: QueuedWrite): Promise<boolean>
  remove(id: string): Promise<void>
}

/** The real store. `idbSet` resolves the key on success and `null` on failure. */
export const indexedDbOutbox: OutboxStore = {
  async all() {
    const rows = await idbAll<QueuedWrite>('outbox')
    // `getAll` on a store with a `keyPath` returns whole objects, so `id` is
    // present. A row without one is unusable and would be replayed as `undefined`,
    // which is worse than dropping it.
    return rows.filter((row): row is QueuedWrite => Boolean(row && typeof row.id === 'string'))
  },
  async put(write) {
    const result = await idbSet('outbox', write.id, write)
    return result !== null
  },
  async remove(id) {
    await idbDelete('outbox', id)
  },
}

/**
 * Listeners for "the queue changed".
 *
 * **Why this exists at all.** A queued write is the only thing in the app the
 * server has not seen, so if nothing re-reads the outbox after it changes, a user
 * can record an expense offline, be told it is saved on this device, and have no
 * way to find it again until a connection happens to drain it. That is the entry
 * looking lost, which is the outcome this feature exists to prevent — so the queue
 * announces itself, and the UI shows what is held.
 *
 * Deliberately a module-level set rather than a hook or context, for ADR-038's
 * reason: writes arrive from forms, sheets and buttons across five screens, and a
 * subscription must not be something a caller can forget to set up.
 */
const listeners = new Set<() => void>()

function announce(): void {
  for (const listener of listeners) listener()
}

export function subscribeToOutbox(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Store a write for later.
 *
 * Returns whether it was stored, rather than assuming. A caller that ignores this
 * and confirms the save anyway reintroduces exactly the bug this module exists to
 * prevent.
 */
export async function enqueue(
  write: Omit<QueuedWrite, 'status' | 'attempts'>,
  store: OutboxStore = indexedDbOutbox,
): Promise<boolean> {
  const stored = await store.put({ status: 'queued', attempts: 0, ...write })
  // Announced only on success. A failed enqueue changes nothing for a subscriber to
  // notice, and the caller is about to render an error instead.
  if (stored) announce()
  return stored
}

export interface DrainResult {
  /** Applied and removed from the queue. */
  applied: number
  /** Rejected on a permanent basis; still queued, marked failed, with a reason. */
  failed: number
  /** Still waiting — either untouched, or behind a retryable failure. */
  remaining: number
  /**
   * True when the drain stopped early because a retryable failure means every
   * remaining write would fail too.
   */
  stopped: boolean
}

/**
 * Attempt every queued write, once, in the order they were made.
 *
 * **The early exit is the part worth explaining.** Without it, ten writes queued
 * offline and replayed into a dead connection become ten requests that each hang
 * until they time out — the user watches a spinner for a minute to learn nothing.
 * So a *retryable* failure stops the pass and leaves the rest untouched, while a
 * *permanent* one is recorded and stepped over, because it says something about
 * that row only.
 *
 * A failed write keeps its place in the queue. It is not discarded: the user may
 * fix the conflict and retry, and silently dropping a write the app could not
 * perform is the failure mode this whole feature is against.
 */
export async function drain(
  apply: ApplyFn,
  store: OutboxStore = indexedDbOutbox,
): Promise<DrainResult> {
  const writes = (await store.all()).sort((a, b) => a.queuedAt - b.queuedAt)

  let applied = 0
  let failed = 0

  for (const write of writes) {
    const result = await apply(write)

    if (result.ok) {
      // Removed on success *and* on already-applied. `apply` reports both the same
      // way, because ADR-042 says the database already being in the requested state
      // is success.
      await store.remove(write.id)
      applied += 1
      continue
    }

    await store.put({
      ...write,
      status: 'failed',
      failure: result.error,
      attempts: write.attempts + 1,
    })
    failed += 1

    if (result.retryable) {
      /**
       * Announced on the way out as well as on the way in, and the ordering is the
       * whole fix. Announcing only before the loop meant a subscriber re-read the
       * queue while every row was still in it, and nothing ever announced again —
       * so the UI kept showing "waiting to sync" for transactions that had already
       * been written, indefinitely, until something unrelated caused a re-read. A
       * pending row that never clears teaches users that the label is decoration.
       */
      announce()
      return { applied, failed, remaining: writes.length - applied - failed, stopped: true }
    }
  }

  announce()
  return { applied, failed, remaining: writes.length - applied - failed, stopped: false }
}