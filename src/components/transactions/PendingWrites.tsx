'use client'

import { useQueuedWrites } from '@/lib/client/useQueuedWrites'
import { formatMinor, toMinor } from '@/lib/money'
import { Icon } from '@/components/ui/Icon'

/**
 * Writes that are on this device and not yet on the server.
 *
 * **Rendered above the transaction list, not inside it**, and that placement is the
 * decision. These rows are not transactions — they have no server id, they are not
 * in any total, and they are not filtered, sorted or paged like the rest. Putting
 * them in the list would imply they had been counted. Above it, they read as
 * "waiting", which is what they are.
 *
 * **The wording is the point.** A queued write is *not* saved; it is saved on this
 * device until a connection drains it (ADR-043). A list entry that said "Saved" and
 * then vanished from the list after a drain would teach the user that the app loses
 * things, which is the belief this feature exists to remove.
 *
 * **A failure says the reason.** "Waiting to sync" on a row the server has already
 * rejected is a lie with a countdown on it. The `failure` string from the drain is
 * shown verbatim, because it is the only thing that can help: a duplicate category
 * name needs the user to rename something.
 */
export function PendingWrites() {
  const writes = useQueuedWrites()
  if (writes.length === 0) return null

  return (
    <section aria-label="Waiting to sync" className="tk-card divide-hairline divide-y">
      {writes.map((write) => {
        const failed = write.status === 'failed'
        const amount = typeof write.payload.amount === 'string' ? write.payload.amount : null

        return (
          <div key={write.id} className="flex items-start gap-3 p-3">
            <Icon name={failed ? 'alert' : 'info'} size={17} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="tk-body">
                {amount !== null ? (
                  <span className="tk-amount">
                    {formatMinor(toMinor(amount), { withSymbol: true })}
                  </span>
                ) : (
                  <span>Saved on this device</span>
                )}
                {amount !== null && <span> — waiting to sync</span>}
              </p>
              <p className={failed ? 'tk-caption text-expense' : 'tk-caption text-muted'}>
                {failed
                  ? (write.failure ?? 'This could not be saved.')
                  : 'Saved on this device. It will sync when you are back online.'}
              </p>
            </div>
          </div>
        )
      })}
    </section>
  )
}