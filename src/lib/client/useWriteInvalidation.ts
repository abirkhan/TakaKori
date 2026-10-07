'use client'

import { useEffect, useRef } from 'react'
import { applyWrite, type WriteKind } from './invalidations'

/**
 * Invalidates the client cache when a Server Action reports success.
 *
 * **This is a bridge, and it is temporary.** The forms still post to Server
 * Actions, and an action's `revalidatePath('/dashboard')` cannot reach a Map in
 * the browser. So between an action writing a row and the cache learning about
 * it, the dashboard keeps serving the figure from before the write.
 *
 * That is not theoretical. The expense E2E test — ADR-004's guard, asserting a
 * purchase moves the total by exactly −12,345 — failed with a delta of **0**.
 * Not an error, not a crash: a stale balance that looked exactly like a correct
 * one. `revalidatePath` reported success the whole time.
 *
 * Phase 2 replaces this: the mutation runs in the client and calls
 * `applyWrite` itself, with no action and no revalidation in between. Until then
 * this hook is what stops a write from being invisible.
 *
 * The `done` argument is the action's success value. A ref records what has
 * already been applied so the effect fires **once per result**, not on every
 * render — the alternative is an invalidation on each keystroke-adjacent
 * re-render, which is both wasteful and, worse, would make a cached read miss
 * forever under any parent re-rendering.
 *
 * `kind` is the write's identity, and it comes from `invalidations.ts` rather
 * than from the call site, so no form can hand-roll a prefix list.
 */
export function useWriteInvalidation(done: unknown, kind: WriteKind): void {
  const applied = useRef<unknown>(undefined)

  useEffect(() => {
    // `undefined` is the initial state of `useActionState`, not a result.
    if (done === undefined) return
    if (applied.current === done) return
    applied.current = done
    void applyWrite(kind)
  }, [done, kind])
}
