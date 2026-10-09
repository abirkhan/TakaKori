'use client'

import { useEffect, useId, useState } from 'react'
import { deleteAdjustmentAction } from '@/actions/transactions'
import { Alert } from '@/components/ui/Alert'
import { ConfirmDeleteSheet } from '@/components/ui/ConfirmDeleteSheet'
import { TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'
import { notifySuccess } from '@/components/app/Toast'
import { useQuery } from '@/lib/client/useQuery'
import { keys } from '@/lib/client/invalidations'
import { getProfile } from '@/lib/queries/client'
import { formatMinor, toMinor } from '@/lib/money'
import type { Account, AccountAdjustment } from '@/lib/queries/reference'

/**
 * Recording a correction against an account balance, and the list of ones already
 * recorded.
 *
 * **Why a correction is a row rather than an edit.** `opening_balance` is a starting
 * point with no ledger entry behind it. Overwriting it changes every balance derived
 * from it and explains none of the change — the user sees a number move and has no way
 * to find out why or undo it. A row in `account_adjustments` (ADR-045) is visible,
 * reversible, and carries a reason. It is also outside income and expense by
 * construction, so a correction cannot inflate "spent this month", which a fourth
 * transaction type could and would.
 *
 * **One field, signed, is the whole interface.** The user states how much the balance
 * should differ by, not what it should become. A field that took an absolute target
 * would have to infer a direction from whichever figure was on screen — and that
 * figure is computed, so it is the one most likely to be what the user is trying to
 * fix. A positive-only amount could not express a downward correction at all.
 *
 * **It is separate from the account form above, with its own submit.** One Save button
 * cannot honestly mean "rename this" and "move money by this much"; and posting a
 * correction must not also write the name field, or a user who typed a new name and
 * then corrected the balance loses the name to a surprising overwrite.
 *
 * **The draft is controlled**, per brand-design rule 13: React resets uncontrolled
 * fields when the action resolves, including when it fails, which is exactly when the
 * user needs to see what they typed.
 *
 * **The parent keys this on the id the action returned**, and that is how the field
 * clears after a successful post. Each post produces a new id, so React mounts a fresh
 * instance with an empty draft — the reset this codebase prefers over an effect, and
 * without the setState-in-an-effect render cascade.
 *
 * The action state comes in as a prop rather than being owned here, because the success
 * message has to be rendered by the parent: a remount of this subtree would take an
 * Alert inside it with it, and a confirmation that appears and is immediately
 * unmounted is worse than none at all.
 */
export function AccountCorrectionForm({
  account,
  recorded,
  form,
  pending,
  error,
  fieldErrors,
  createdId,
}: {
  account: Account
  recorded: AccountAdjustment[]
  form: (payload: FormData) => void
  pending: boolean
  error?: string
  fieldErrors?: Record<string, string>
  /** Set only after a post that actually landed. */
  createdId?: string
}) {
  const [draft, setDraft] = useState({ amount: '', reason: '' })
  const [removing, setRemoving] = useState<AccountAdjustment | null>(null)
  const formId = useId()

  /**
   * The recorded amounts are formatted in the user's currency, read from the profile.
   *
   * `formatMinor` defaults to BDT, and this sheet sits directly under a breakdown that
   * formats in the profile's currency. Without this the two halves of one screen
   * disagree for anyone who is not on BDT — the total in dollars, the corrections under
   * it in taka — which reads as two different accounts rather than one account with a
   * mislabelled list.
   */
  const profile = useQuery(keys.profile(), () => getProfile())
  const currency = profile.data?.currency ?? 'BDT'

  /**
   * Announce the write, from inside the subtree that is about to be destroyed.
   *
   * The parent keys this component on `createdId`, so a successful post mounts a fresh
   * instance — which is how the draft clears. A confirmation rendered here would be
   * unmounted on the very render that confirmed the write. A toast lives outside this
   * tree entirely, in a persistent `aria-live="polite"` region, so it survives and is
   * actually announced; the sheet has no `role="alert"` of its own, so an inline Alert
   * inserted above the fold of a scrolled modal body would be silent for a screen
   * reader and easy to miss for everyone else.
   *
   * Firing on mount is what makes it fire exactly once: a post produces a new
   * `createdId`, which changes the key, which remounts, which runs this effect. No ref
   * to compare against and no dependence on the success *message*, which is the same
   * string every time.
   */
  useEffect(() => {
    if (createdId) notifySuccess('Correction recorded')
  }, [createdId])

  return (
    <>
      <form id={formId} action={form} className="mt-5 flex flex-col gap-4">
        <h3 className="tk-section">Correct the balance</h3>

        {error && <Alert tone="error">{error}</Alert>}

        <input type="hidden" name="accountId" value={account.id} />

        <TextField
          name="amount"
          label="Amount to add or subtract"
          inputMode="decimal"
          money
          placeholder="e.g. 500 or -500"
          value={draft.amount}
          onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
          error={fieldErrors?.amount}
          hint="Signed. A mistyped or forgotten opening balance is usually a difference, not a new figure."
        />

        <TextField
          name="reason"
          label="Why (optional)"
          maxLength={200}
          placeholder="e.g. Opening balance was entered twice"
          value={draft.reason}
          onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
          error={fieldErrors?.reason}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            form={formId}
            disabled={pending}
            className={buttonClass('primary', { size: 'sm' })}
          >
            {pending ? 'Recording…' : 'Record correction'}
          </button>
          <span className="tk-caption">
            Recorded as its own entry, not as income or spending — your monthly totals do not
            move.
          </span>
        </div>
      </form>

      {/*
        Only shown once there is something to show. An empty "Recorded corrections"
        heading under a form is noise on an account nobody has corrected, and the
        breakdown above already says whether any exist.
      */}
      {recorded.length > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          <h4 className="tk-label">Recorded corrections</h4>
          <ul className="tk-card-flat flex flex-col gap-3">
            {recorded.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-3">
                <span className="tk-caption min-w-0">
                  {a.reason ?? 'No reason given'}
                  {/* The date, because a correction with no date is as
                      unattributable as an opening balance with no entry behind it. */}
                  <span className="block">{new Date(a.created_at).toLocaleDateString()}</span>
                </span>
                {/*
                  Neutral, and not signed with a `+`. An adjustment is neither income nor
                  expense, and colouring it as either would be precisely the misreading
                  the separate table exists to prevent. The minus, where there is one,
                  carries the direction on its own.
                */}
                <span className="tk-amount shrink-0">{formatMinor(toMinor(a.amount), { currency })}</span>
                {/*
                  One action target, and it is destructive, so it goes through the same
                  confirmation every other delete in the app does.

                  This exists because the alternative was a correction the user could
                  make but not take back. A correction exists to fix a mistake, and a fix
                  for a mistake that cannot itself be undone is a worse position than
                  the silent column edit it replaced — that one at least could be
                  re-typed. Found the hard way: the E2E suite recorded corrections to
                  test them and had no way to remove them, so every run left the shared
                  test account's balance permanently further off. That is what a missing
                  undo looks like from the outside.
                */}
                <button
                  type="button"
                  onClick={() => setRemoving(a)}
                  className={buttonClass('quiet', { size: 'sm' })}
                  /**
                   * The amount, not the reason.
                   *
                   * Reasons repeat — the same user correcting the same kind of mistake
                   * twice produces two identical labels — and two identically-named
                   * controls in one list is both an accessibility fault and a test's
                   * only way to tell rows apart. The amount is also the thing that makes
                   * the label say what is about to be removed.
                   */
                  aria-label={`Remove the correction of ${formatMinor(toMinor(a.amount), { currency })}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {removing && (
        <ConfirmDeleteSheet
          open
          onClose={() => setRemoving(null)}
          title="Remove this correction?"
          description="The balance goes back to what it was without it. Nothing else changes."
          action={deleteAdjustmentAction}
          kind="account"
          hidden={{ id: removing.id }}
          confirmLabel="Remove the correction"
          savedMessage="Correction removed."
        >
          <p className="tk-money">
            {formatMinor(toMinor(removing.amount), { currency })}
          </p>
        </ConfirmDeleteSheet>
      )}
    </>
  )
}