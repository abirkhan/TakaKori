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
 * The tail of a filtered statement: another `eq`, and a terminal that is awaitable.
 *
 * Supabase's builders are thenable, so the chain *is* the promise. Modelled as one
 * interface rather than two so that `.eq(...).eq(...)` type-checks as either — which
 * is why a delete needs no `.select()`: deleting zero rows is not an error, so there
 * is nothing to select in order to tell it apart from deleting one.
 */
interface EqChain extends PromiseLike<{ data: unknown; error?: unknown }> {
  eq(column: string, value: unknown): EqChain
}

/**
 * The slice of the Supabase client this module uses.
 *
 * Structural rather than the full `SupabaseClient`, so a test can supply a fake and
 * so the compiler will refuse this file if it ever grows a dependency it does not
 * need. It has grown one entry at a time, each alongside the kind that needed it.
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
    update(row: Record<string, unknown>): {
      eq(column: string, value: unknown): EqChain
    }
    delete(): {
      eq(column: string, value: unknown): EqChain
    }
  }
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error?: unknown }>
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

/**
 * Where each create lands.
 *
 * Every create is the same operation with a different table, which is why they share
 * one function: the read-before-replay logic below is the whole of ADR-042 and it
 * has been verified against the real table, so there is nothing per-table about it.
 * A kind that appears here but not in `QUEUEABLE_KINDS` cannot be queued, and one
 * that is queued but absent here cannot be replayed — the two lists are meant to be
 * identical, and keeping them adjacent is what stops them drifting.
 */
const CREATE_TABLES: Record<string, string> = {
  'transaction.create': 'transactions',
  'account.create': 'accounts',
  'category.create': 'categories',
  'budget.create': 'budgets',
  'recurring.create': 'recurring_transactions',
}

/** The one edit the app offers today. Same table as the create. */
const UPDATE_TABLES: Record<string, string> = {
  'transaction.update': 'transactions',
}

/**
 * Where each delete lands.
 *
 * Separate from `CREATE_TABLES` because the convergence is different in kind, not
 * just in detail: a delete needs no read, because PostgREST reports deleting zero
 * rows as success. ADR-042's reasoning for why that is the right definition of
 * "already done" is recorded there — "delete this" is an intent about existence
 * rather than about content, so an edit elsewhere does not change what was asked.
 */
const DELETE_TABLES: Record<string, string> = {
  'transaction.delete': 'transactions',
  'budget.delete': 'budgets',
  'recurring.delete': 'recurring_transactions',
}

/**
 * Replay one queued write.
 *
 * **Convergence is the contract.** `ok: true` means the database is in the state
 * this write asked for — whether this pass wrote it or an earlier one already had.
 * The drain cannot tell those apart and must not need to.
 *
 * `retryable` is what protects the queue from a doomed pass: a network error will
 * fail every remaining row too, so it must stop the drain, while a genuine
 * conflict says something about this row alone.
 */
export async function applyQueuedWrite(
  ctx: ApplyContext,
  write: QueuedWrite,
): Promise<ApplyResult> {
  const createTable = CREATE_TABLES[write.kind]
  if (createTable) return createRow(ctx, createTable, write)

  const updateTable = UPDATE_TABLES[write.kind]
  if (updateTable) return updateRow(ctx, updateTable, write)

  const deleteTable = DELETE_TABLES[write.kind]
  if (deleteTable) return removeRow(ctx, deleteTable, write)

  if (write.kind === 'occurrence.post') return postOccurrence(ctx, write)

  // Unreachable in practice: nothing enqueues a kind outside `QUEUEABLE_KINDS`.
  // It is a *permanent* failure rather than a retryable one on purpose: if it ever
  // were reached, retrying the same row forever would be worse than saying so, and a
  // queued write the app cannot perform must never look like a success.
  return {
    ok: false,
    error: 'This write cannot be replayed by this version of the app.',
    retryable: false,
  }
}

/**
 * The row a queued write acts on.
 *
 * In `payload.id`, not the queued write's own `id` — that one is the identity of the
 * queued *record*, and for a create it doubles as the new row's id. For a delete it
 * identifies nothing about the row being deleted.
 */
function targetId(write: QueuedWrite): string | null {
  const id = write.payload.id
  return typeof id === 'string' && id !== '' ? id : null
}

/**
 * Delete by id, where absent counts as success.
 *
 * **Both `.eq`s, always.** `id` alone is the rule from AGENTS.md — PostgREST matches
 * every row when the filter is missing — and `workspace_id` matches what the Server
 * Actions do.
 */
async function removeRow(
  ctx: ApplyContext,
  table: string,
  write: QueuedWrite,
): Promise<ApplyResult> {
  const id = targetId(write)
  if (!id) return { ok: false, error: 'This delete has nothing to delete.', retryable: false }

  const removed = await ctx.supabase
    .from(table)
    .delete()
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)

  // Deleting zero rows is not an error, which is exactly why a replayed delete
  // converges with nothing to reconcile and no read to get wrong.
  if (!removed.error) return { ok: true }
  return { ok: false, error: 'The server rejected this delete.', retryable: false }
}

/**
 * Apply an edit.
 *
 * **No read, and none needed.** Writing a row the values it already holds changes
 * nothing, so a replayed edit is a no-op rather than a second write — convergence
 * by construction. `id` is stripped so the update cannot try to move the row's
 * identity.
 *
 * A row that has since been deleted updates zero rows, which is not an error, and is
 * reported as converged. That is a judgement: the user asked to change something
 * that is not there, and inventing an error for it would strand the row in the queue
 * failing forever over a discrepancy they cannot act on.
 */
async function updateRow(
  ctx: ApplyContext,
  table: string,
  write: QueuedWrite,
): Promise<ApplyResult> {
  const id = targetId(write)
  if (!id) return { ok: false, error: 'This change has nothing to change.', retryable: false }

  const { id: _moved, ...changes } = write.payload
  void _moved

  const updated = await ctx.supabase
    .from(table)
    .update(changes)
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)

  if (!updated.error) return { ok: true }
  return { ok: false, error: 'The server rejected this change.', retryable: false }
}

/**
 * Post one occurrence of a recurring rule.
 *
 * **The only kind that needed none of the read-before-replay machinery.**
 * `post_recurring_occurrence` is `SECURITY INVOKER`, takes `FOR UPDATE` on the rule,
 * validates the date against the schedule and advances `last_posted_on` in one
 * statement. Its watermark raises `23505` "That occurrence has already been posted",
 * which *is* the already-applied signal — from the database, atomically, and without
 * a round trip to check first.
 *
 * Treating `23505` as convergence is safe here specifically because that is the only
 * `23505` this function can raise; the other two failures are `no_data_found` for a
 * rule that has gone and `check_violation` for a date that is not a real occurrence,
 * and both stay errors.
 */
async function postOccurrence(ctx: ApplyContext, write: QueuedWrite): Promise<ApplyResult> {
  // `id` is the rule. `postOccurrenceAction` names it that way in its FormData, and
  // renaming it here would have meant a queued occurrence posting against no rule.
  const ruleId = write.payload.id
  const occurrenceDate = write.payload.occurrenceDate

  if (typeof ruleId !== 'string' || typeof occurrenceDate !== 'string') {
    return { ok: false, error: 'This occurrence is missing its date.', retryable: false }
  }

  const result = await ctx.supabase.rpc('post_recurring_occurrence', {
    target_recurring_id: ruleId,
    occurrence_date: occurrenceDate,
  })

  if (!result.error) return { ok: true }
  // The watermark's own "already posted". Convergence, not a failure.
  if (isUniqueViolation(result.error)) return { ok: true }

  return { ok: false, error: 'The server rejected this occurrence.', retryable: false }
}

/**
 * Create a row, converging on one that already exists.
 *
 * The queued `id` is the row's `id`, which is what makes the whole thing work: the
 * read asks about the uuid the browser generated when the user pressed save, so
 * "did this already land?" is answerable without trusting any server-side record of
 * what was attempted.
 */
async function createRow(
  ctx: ApplyContext,
  table: string,
  write: QueuedWrite,
): Promise<ApplyResult> {
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