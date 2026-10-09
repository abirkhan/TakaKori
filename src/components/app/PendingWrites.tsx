'use client'

import { useState } from 'react'
import { useQueuedWrites } from '@/lib/client/useQueuedWrites'
import { discardQueuedWrite, retryQueuedWrite, parkedWrites } from '@/lib/client/outbox'
import { formatMinor, toMinor } from '@/lib/money'
import { Icon } from '@/components/ui/Icon'
import { buttonClass } from '@/components/ui/button'

/**
 * Writes that are on this device and not yet on the server.
 *
 * **Global, because the queue is.** This component used to render only on
 * `/transactions`, above the transaction list. That was right for its own sake — these
 * rows are not transactions, they have no server id, they are in no total, and putting
 * them in the list would imply they had been counted — and wrong about where it lived.
 * Nine of the ten queueable writes are not transactions: a category, a budget, a
 * recurring rule, an account. A user who queued one on /categories and then found it
 * had been rejected had to guess that the answer was on a different screen, and a
 * parked row they could not *see* was still a dead end however good the discard button
 * was. It renders in the root layout beside `OfflineBanner`, which is the other piece
 * of global connectivity state, and returns null when the queue is empty so it costs
 * nothing on a screen with nothing queued.
 *
 * **The wording is the point.** A queued write is *not* saved; it is saved on this
 * device until a connection drains it (ADR-043). A list entry that said "Saved" and
 * then vanished after a drain would teach the user that the app loses things, which is
 * the belief this feature exists to remove.
 *
 * **A failure says the reason.** "Waiting to sync" on a row the server has already
 * rejected is a lie with a countdown on it. The `failure` string from the drain is
 * shown verbatim, because it is the only thing that can help: a duplicate category
 * name needs the user to rename something.
 *
 * **A parked row offers two ways out, and it has to offer both.** It was a dead end:
 * a write the app could not perform, that the drain would not retry, that the user
 * could neither apply nor remove. Every other error in this app offers an action, and
 * a row stuck here forever is the entry looking lost — the exact belief ADR-043 exists
 * to remove, arrived at by withholding the remedy.
 *
 * "Try again" alone would be theatre, though, so the row that failed on a **name** lets
 * the user correct it in place. Replaying unchanged fails for the same reason: the
 * user renames the category in the app and the queued payload still carries the old
 * name. A retry button that fails identically forever is worse than no button,
 * because it looks like progress.
 */
export function PendingWrites() {
  const writes = useQueuedWrites()
  // Which parked row is being corrected. One at a time, because the thing being
  // edited is the queued payload and two open editors of one payload is never what
  // anyone wants.
  const [fixing, setFixing] = useState<{ id: string; value: string } | null>(null)

  if (writes.length === 0) return null

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pt-3">
    <section aria-label="Waiting to sync" className="tk-card divide-hairline divide-y">
      {writes.map((write) => {
        const parked = parkedWrites([write]).length === 1
        const amount = typeof write.payload.amount === 'string' ? write.payload.amount : null
        const name = typeof write.payload.name === 'string' ? write.payload.name : null
        const open = fixing?.id === write.id

        return (
          <div key={write.id} className="flex items-start gap-3 p-3">
            <Icon name={parked ? 'alert' : 'info'} size={17} className="mt-0.5 shrink-0" />
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
                {parked && name !== null && (
                  <span className="tk-caption"> · {name}</span>
                )}
              </p>

              <p className={parked ? 'tk-caption text-expense' : 'tk-caption text-muted'}>
                {write.failure ?? 'Saved on this device. It will sync when you are back online.'}
              </p>

              {parked && (
                <>
                  {/*
                    The correction field appears only for a payload that actually has a
                    name to correct. Offering an input for a write whose conflict is
                    about something else would invite the user to change a field the
                    server never objected to.
                  */}
                  {open && name !== null && (
                    <label className="mt-2 flex flex-col gap-1.5">
                      <span className="tk-label">Change it to</span>
                      <input
                        name={`fix-${write.id}`}
                        defaultValue={name}
                        maxLength={80}
                        autoFocus
                        className="tk-field"
                        onKeyDown={(e) => {
                          // Enter submits, Escape backs out. A correction box with no
                          // keyboard route is a correction box half-built.
                          if (e.key === 'Escape') setFixing(null)
                        }}
                      />
                    </label>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {open && name !== null ? (
                      <>
                        <button
                          type="button"
                          className={buttonClass('primary', { size: 'sm' })}
                          onClick={() => {
                            const input = document.querySelector<HTMLInputElement>(
                              `input[name="fix-${CSS.escape(write.id)}"]`,
                            )
                            void retryQueuedWrite(write.id, { name: input?.value.trim() })
                            setFixing(null)
                          }}
                        >
                          Try again
                        </button>
                        <button
                          type="button"
                          className={buttonClass('quiet', { size: 'sm' })}
                          onClick={() => setFixing(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className={buttonClass('soft', { size: 'sm' })}
                        onClick={() =>
                          name !== null
                            ? setFixing({ id: write.id, value: name })
                            : void retryQueuedWrite(write.id)
                        }
                      >
                        {name !== null ? 'Change and retry' : 'Try again'}
                      </button>
                    )}

                    {/*
                      Wording is deliberate. This is the only path in the outbox that
                      deletes a queued write, and it has to say what it costs — the
                      entry is not merely hidden, it is gone, and there is no server
                      copy. Saying "Discard" alone would let someone destroy a
                      financial record with a word that sounds like tidying up.
                    */}
                    <button
                      type="button"
                      className={buttonClass('quiet', { size: 'sm' })}
                      onClick={() => void discardQueuedWrite(write.id)}
                    >
                      Discard this entry
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })}
    </section>
    </div>
  )
}