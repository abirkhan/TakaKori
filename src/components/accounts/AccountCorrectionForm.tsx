'use client'

import { useId, useState } from 'react'
import { createAdjustmentAction, type ActionState } from '@/actions/transactions'
import { Alert } from '@/components/ui/Alert'
import { TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'
import { useWriteAction } from '@/lib/client/useWriteAction'
import { useWriteInvalidation } from '@/lib/client/useWriteInvalidation'
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
 * **The parent keys this component on `recorded.length`**, and that is how the field
 * clears after a successful post. Each post grows the list, so React mounts a fresh
 * instance with an empty draft — the reset this codebase prefers over an effect, and
 * without the setState-in-an-effect render cascade.
 */
export function AccountCorrectionForm({
  account,
  recorded,
}: {
  account: Account
  recorded: AccountAdjustment[]
}) {
  const [adjust, adjustForm, pending] = useWriteAction<ActionState>(createAdjustmentAction, {})
  const [draft, setDraft] = useState({ amount: '', reason: '' })
  const formId = useId()

  useWriteInvalidation(adjust.success, 'account')

  return (
    <>
      <form id={formId} action={adjustForm} className="mt-5 flex flex-col gap-4">
        <h3 className="tk-section">Correct the balance</h3>

        {adjust.error && <Alert tone="error">{adjust.error}</Alert>}

        <input type="hidden" name="accountId" value={account.id} />

        <TextField
          name="amount"
          label="Amount to add or subtract"
          inputMode="decimal"
          money
          placeholder="e.g. 500 or -500"
          value={draft.amount}
          onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
          error={adjust.fieldErrors?.amount}
          hint="Signed. A mistyped or forgotten opening balance is usually a difference, not a new figure."
        />

        <TextField
          name="reason"
          label="Why (optional)"
          maxLength={200}
          placeholder="e.g. Opening balance was entered twice"
          value={draft.reason}
          onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
          error={adjust.fieldErrors?.reason}
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
          <ul className="tk-card-flat flex flex-col gap-2">
            {recorded.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-3">
                <span className="tk-caption">
                  {a.reason ?? 'No reason given'}
                  {/* The date, because a correction with no date is as
                      unattributable as an opening balance with no entry behind it. */}
                  <span className="block">{new Date(a.created_at).toLocaleDateString()}</span>
                </span>
                {/*
                  Neutral, and not signed with a +. An adjustment is neither income nor
                  expense, and colouring it as either would be precisely the misreading
                  the separate table exists to prevent. The minus, where there is one,
                  carries the direction on its own.
                */}
                <span className="tk-amount">{formatMinor(toMinor(a.amount))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}