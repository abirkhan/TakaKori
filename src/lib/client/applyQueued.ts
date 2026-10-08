'use client'

/**
 * Replaying a queued write.
 *
 * **This is where ADR-042 becomes real.** The policy is that a queued write
 * succeeds when the database is already in the state it asked for. Applied is not
 * the same as inserted, and an implementation that insists on the second will
 * duplicate the first — which for this app means a user records a 200 taka expense
 * in a lift twice and has to notice and fix it themselves.
 *
 * **Why read before write, when the primary key already rejects duplicates.**
 * Both work. Re-reading costs one extra round trip per queued write during a drain
 * and buys the property that the failure mode is *a failed read* rather than a
 * duplicate row. That is the right side to err on for a ledger. The cheaper rule —
 * treat `23505` as "already applied" — was rejected because it cannot tell a
 * primary-key replay from a genuine `23505` on another index, and getting that
 * wrong turns "you already have a category called Food" into a silent success.
 *
 * **Verified against the real table**, not reasoned about: an explicit client uuid
 * inserts successfully, the same uuid a second time is rejected naming
 * `transactions_pkey`, the row count stays at 1, and the rejected insert does not
 * overwrite the row's contents. So a user who edits a transaction after queueing it
 * does not get their edit reverted by the next drain.
 *
 * **Not upserting, deliberately.** An upsert on `id` converges too, and it would
 * also *overwrite* a row the user has since edited, reverting it to the queued
 * payload. That is silent data loss traded for a round trip.
 */

import type { ApplyResult } from './outbox'
import type { QueuedWrite } from './outbox'

/**
 * The slice of the Supabase client this module uses.
 *
 * Structural rather than the full `SupabaseClient`, so a test can supply a fake and
 * so the compiler will refuse this file if it ever grows a dependency it does not
 * need. Typed loosely because the client's chainable builder types are far wider
 * than the two calls below.
 */
export interface WriteClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        maybeSingle(): Promise<{ data: { id: string } | null; error?: unknown }>
      }
    }
    insert(row: Record<string, unknown>): {
      select(columns: string): {
        single(): Promise<{ data: { id: string } | null; error?: unknown }>
      }
    }
  }
}

/** PostgREST unique violation. The only one this module treats specially. */
const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  )
}

export interface ApplyContext {
  supabase: WriteClient
  /**
   * The caller's workspace.
   *
   * Read from the cached profile, never from anything the user typed. RLS is still
   * the authority — `transactions_insert_member`'s `with check` rejects a foreign
   * `workspace_id` regardless — but the app should not be relying on that to
   * discover it sent the wrong one.
   */
  workspaceId: string
}

const TABLE: Record<string, string> = {
  'transaction.create': 'transactions',
}

/**
 * Replay one queued write.
 *
 * **Convergence is the contract.** `ok: true` means the database is in the state
 * this write asked for — whether this pass inserted it or an earlier one already
 * had. The drain cannot tell those apart and must not need to.
 *
 * `retryable` is what protects the queue from a doomed pass: a network error will
 * fail every remaining row too, so it must stop the drain, while a genuine
 * conflict says something about this row alone.
 */
export async function applyQueuedWrite(
  ctx: ApplyContext,
  write: QueuedWrite,
): Promise<ApplyResult> {
  switch (write.kind) {
    case 'transaction.create':
      return createTransaction(ctx, write)
    default:
      // Nothing enqueues these yet, so this is unreachable in practice. It is a
      // *permanent* failure rather than a retryable one on purpose: if it ever were
      // reached, retrying the same row forever would be worse than saying so, and a
      // queued write that the app cannot perform must never look like a success.
      return {
        ok: false,
        error: 'This write cannot be replayed by this version of the app.',
        retryable: false,
      }
  }
}

/**
 * Create a transaction, converging on an existing row.
 *
 * The queued `id` is the transaction's `id`, which is what makes the whole thing
 * work: the read asks about the id the browser generated when the user pressed
 * save, so "did this already land?" is answerable without trusting any server-side
 * record of what was attempted.
 */
async function createTransaction(ctx: ApplyContext, write: QueuedWrite): Promise<ApplyResult> {
  const table = TABLE[write.kind]
  const id = write.id

  const existing = await ctx.supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (existing.error) {
    // A read that failed tells us nothing about whether the row is there, and
    // inserting anyway risks a duplicate. Retryable: the next pass can try again.
    return { ok: false, error: 'Could not check whether this was already saved.', retryable: true }
  }

  // Already applied. An earlier pass of this same queued write landed it. This is
  // success, and it is the case the whole design exists for.
  if (existing.data) return { ok: true }

  /**
   * `id` and `workspace_id` are set **after** the payload spreads, deliberately, so
   * nothing in a stored payload can override either of them.
   *
   * This is not theoretical tidiness. The payload is whatever was in the form when
   * the user pressed save, it round-trips through IndexedDB, and `workspace_id` in
   * particular is exactly the field RLS checks. RLS *would* reject a foreign
   * workspace, so the damage is stopped at the database — but an app that sends
   * another workspace's id and relies on being told no is not one I want to ship,
   * and the two fields the server must not be told about should not be
   * payload-controlled in the first place.
   */
  const row = {
    ...write.payload,
    id,
    workspace_id: ctx.workspaceId,
  }

  const inserted = await ctx.supabase.from(table).insert(row).select('id').single()

  if (!inserted.error) return { ok: true }

  /**
   * Lost a race, or the read was served from a stale read replica while a previous
   * drain had in fact inserted. Either way the row we wanted now exists, so this is
   * convergence and not a failure. Restricted to `23505` rather than swallowing
   * every error: a shape-CHECK violation means the payload is wrong and must be
   * reported, not retried into a permanent failure that hides a real bug.
   */
  if (isUniqueViolation(inserted.error)) return { ok: true }

  return {
    ok: false,
    error: 'The server rejected this transaction.',
    retryable: false,
  }
}