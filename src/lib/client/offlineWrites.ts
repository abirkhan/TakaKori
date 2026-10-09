'use client'

/**
 * Offline writes, composed.
 *
 * Three pieces that only make sense together:
 *
 * - `payloadFor` — turns a `FormData` into a row. The Server Actions take
 *   `FormData` with camelCase field names; the database wants snake_case columns.
 *   Queued rows are stored **already shaped like rows**, so replay is a matter of
 *   inserting rather than of re-deriving anything.
 * - `queueWrite` — the browser's half of ADR-043: generate the id, store it, and
 *   report whether it was stored.
 * - `drainQueued` and `useOutboxDrain` — replay when there is a connection.
 *
 * **Why the id is generated here, at the moment the user pressed save.** It is the
 * only thing that makes "did this already land?" answerable later without trusting
 * any server-side record of what was attempted, and it has to be the same id on
 * every attempt of the same queued write. Generating it during the drain instead
 * would give a replay a fresh identity, which is a second row.
 */

import { useEffect } from 'react'
import { drain, enqueue, type DrainResult, type QueuedWriteKind } from './outbox'
import { applyQueuedWrite } from './applyQueued'
import { clientContext } from '@/lib/queries/client'

/**
 * Form field name to column, per write kind.
 *
 * Explicit rather than derived by snake-casing: `accountId` to `account_id` is a
 * coincidence, not a rule, and a convention would quietly start producing wrong
 * column names the first time a field was named something like `occurredOn`. Every
 * kind added here is one this build can actually replay — `applyQueuedWrite` returns
 * a permanent failure for anything absent, and a write that can be queued but not
 * replayed would sit in the queue failing forever.
 */
const COLUMNS: Record<string, Record<string, string>> = {
  'transaction.create': {
    type: 'type',
    amount: 'amount',
    accountId: 'account_id',
    categoryId: 'category_id',
    counterpartyAccountId: 'counterparty_account_id',
    occurredOn: 'occurred_on',
    description: 'description',
  },
  // An edit carries the row it changes in `id`, plus only the fields
  // `updateTransactionAction` actually reads. Deliberately *not* the create's field
  // list: it does not accept accountId, categoryId or counterpartyAccountId, so
  // mapping them would make a queued edit change columns the online path leaves
  // alone — an offline replay that is quietly not the same write.
  'transaction.update': {
    id: 'id',
    type: 'type',
    amount: 'amount',
    occurredOn: 'occurred_on',
    description: 'description',
  },
  'transaction.delete': { id: 'id' },
  'account.create': { name: 'name', kind: 'kind', openingBalance: 'opening_balance' },
  // `openingBalance` is **required** on the Server Action, and this is why: a patch
  // is not a merge. Omitting it would write '0.00' over a real balance, and a queued
  // edit carrying no balance would do that silently, on a device nobody is watching.
  'account.update': {
    id: 'id',
    name: 'name',
    kind: 'kind',
    openingBalance: 'opening_balance',
  },
  'category.create': { name: 'name', type: 'type' },
  'category.update': { id: 'id', name: 'name', type: 'type' },
  'budget.create': { amount: 'amount', categoryId: 'category_id' },
  'budget.delete': { id: 'id' },
  'recurring.delete': { id: 'id' },
  // `id` is the *rule*, not the occurrence — `postOccurrenceAction` reads it as
  // `formData.get('id')` and `applyQueuedWrite` passes it on as
  // `target_recurring_id`.
  'occurrence.post': { id: 'id', occurrenceDate: 'occurrenceDate' },
}

/**
 * The kinds this build can both queue and replay.
 *
 * Derived from `COLUMNS`, so the two cannot drift: a kind with no field mapping
 * cannot be queued, and `applyQueuedWrite` refuses anything it cannot replay.
 *
 * **`recurring.create` is deliberately absent.** Its form has a dozen fields and they
 * have not been read against `RecurringForm`, and a mapping guessed from a
 * neighbouring form is how a queued rule arrives with a null where an amount belongs.
 * Omitting it is safe by construction — the write is refused offline with a plain
 * message — and adding it is a small, checkable change.
 */
export const QUEUEABLE_KINDS = Object.keys(COLUMNS) as QueuedWriteKind[]

/**
 * Shape a form's fields into a row.
 *
 * Returns `null` for a kind this build cannot replay, which is how
 * `queueWrite` ends up refusing rather than accepting a write it could never
 * drain. Fields absent from the map are dropped rather than passed through: an
 * unrecognised field is either a mistake or something the server must not be told
 * about.
 */
export function payloadFor(
  kind: QueuedWriteKind,
  formData: FormData,
): Record<string, unknown> | null {
  const columns = COLUMNS[kind]
  if (!columns) return null

  const row: Record<string, unknown> = {}
  for (const [field, column] of Object.entries(columns)) {
    const value = formData.get(field)
    if (typeof value === 'string' && value !== '') row[column] = value
  }
  return row
}

/**
 * Store a write for replay. Resolves whether it was actually stored.
 *
 * **The boolean is the whole point.** ADR-043: a queued write may not fail soft,
 * because the caller is about to tell the user their money is recorded. If this
 * returns false the form must say the write did not happen.
 */
export async function queueWrite(kind: QueuedWriteKind, formData: FormData): Promise<boolean> {
  const payload = payloadFor(kind, formData)
  if (!payload) return false

  return enqueue({
    id: crypto.randomUUID(),
    kind,
    payload,
    queuedAt: Date.now(),
  })
}

/**
 * Replay everything queued, once.
 *
 * The `clientContext()` cast is deliberate and commented: the real client is far
 * wider than the two calls `applyQueuedWrite` makes, and widening `WriteClient` to
 * match would mean depending on the whole builder chain to use two of its methods.
 */
export async function drainQueued(): Promise<DrainResult> {
  const ctx = await clientContext()

  return drain((write) =>
    applyQueuedWrite(
      // Safe by construction: `applyQueuedWrite` only calls `from().select().eq()`
      // and `from().insert().select()`, both of which the real client provides.
      { supabase: ctx.supabase as unknown as Parameters<typeof applyQueuedWrite>[0]['supabase'], workspaceId: ctx.workspaceId },
      write,
    ),
  )
}

/**
 * Drain on open, and whenever the connection comes back.
 *
 * **Only while foregrounded, on purpose.** Safari will not run a queued write in
 * the background, so a background-sync design would promise something this app
 * cannot deliver on the platform most of its users are on. Draining on open covers
 * it anyway: the user opens the app, the queue drains, and they see the result.
 *
 * A drain that throws is swallowed, because it runs from an effect and an unhandled
 * rejection there would take down a screen the user was only reading. The outbox
 * keeps its rows either way.
 */
export function useOutboxDrain(): void {
  useEffect(() => {
    const run = () => {
      void drainQueued().catch(() => {})
    }
    run()
    window.addEventListener('online', run)
    return () => window.removeEventListener('online', run)
  }, [])
}