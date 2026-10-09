'use client'

import { useEffect, useId, useState } from 'react'
import { useWriteInvalidation } from '@/lib/client/useWriteInvalidation'
import {
  deleteAccountAction,
  updateAccountAction,
  type ActionState,
} from '@/actions/transactions'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { SelectField, TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'
import { useWriteAction } from '@/lib/client/useWriteAction'
import { keys } from '@/lib/client/invalidations'
import { listAdjustments } from '@/lib/queries/client'
import { useQuery } from '@/lib/client/useQuery'
import { AccountBalanceBreakdown } from '@/components/accounts/AccountBalanceBreakdown'
import { AccountCorrectionForm } from '@/components/accounts/AccountCorrectionForm'
import type { Account } from '@/lib/queries/reference'

const KINDS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank account' },
  { value: 'mobile', label: 'Mobile wallet (bKash, Nagad)' },
  { value: 'credit_card', label: 'Credit card' },
] as const

/**
 * Correcting an account.
 *
 * **This sheet exists because a mistyped opening balance used to be permanent.**
 * The app could create an account and nothing else: no update, no delete, no
 * archive. A figure typed wrong on a brand-new account therefore stayed wrong with
 * no way out of the UI, which is the worst possible behaviour in the one screen
 * where the user is most likely to make a mistake.
 *
 * **The opening balance is no longer editable here, and that is the point.** It used
 * to be, pre-filled from the account row — which produced the trap this screen is now
 * built around. On an account reading ৳5,000.00 with a real transaction behind it, the
 * field showed `0.00`. Both numbers were true and neither said which was which, so the
 * field invited the user to correct the one that was *not* the balance. Verified
 * against the database: that account's opening balance really was 0.00.
 *
 * Editing it also moved money with nothing to show for it. `opening_balance` is a
 * starting point with no ledger entry behind it, so overwriting it changes every
 * balance derived from it while explaining none of the change. So the correction is a
 * row in `account_adjustments` (ADR-045): signed, with a reason, visible in the
 * breakdown above, and affecting income and expense totals not at all.
 *
 * **Both correction directions are one field.** The user says how much the balance
 * should differ by, not what it should become. An absolute target would have to guess
 * a direction from the figure the user is looking at, and a positive-only amount could
 * not express a downward correction at all. A zero is refused: it would sit in the
 * ledger looking like a record while changing nothing.
 *
 * **Every field is pre-filled and the draft is controlled**, per brand-design rule
 * 13. React resets uncontrolled fields when the action resolves, including when it
 * fails — so an un-controlled edit form would clear itself the moment the server
 * rejected the change, which is precisely when the user needs to see what they
 * typed and correct it.
 *
 * **Three outcomes, and all three are offered rather than one guessed at.** Saving
 * corrects the account. Archiving hides it while keeping its transactions. Removing
 * it only works when there are none, and says so when there are — the alternative
 * is a form that confidently deletes a year of history.
 */
export function AccountEditSheet({
  account,
  open,
  onClose,
}: {
  account: Account
  open: boolean
  onClose: () => void
}) {
  const [update, updateForm, updatePending] = useWriteAction<ActionState>(
    updateAccountAction,
    {},
    { queueKind: 'account.update' },
  )
  const [remove, removeForm, removePending] = useWriteAction<ActionState>(deleteAccountAction, {})

  const [draft, setDraft] = useState(() => ({
    name: account.name,
    kind: account.kind,
  }))

  const formId = useId()
  const removeFormId = useId()

  const adjustments = useQuery(keys.adjustments(account.id), () => listAdjustments(account.id))

  useWriteInvalidation(update.success, 'account')
  useWriteInvalidation(remove.success, 'account')

  // Both close on success, so a rejection leaves the sheet open with the reason
  // beside the field that caused it.
  useEffect(() => {
    if (update.success && open) onClose()
  }, [update.success, open, onClose])
  useEffect(() => {
    if (remove.success) onClose()
  }, [remove.success, onClose])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit account"
      description="Correct the name or type, or record a correction against the balance."
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass('quiet')}>
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            disabled={updatePending}
            className={buttonClass('primary')}
          >
            {updatePending ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <form id={formId} action={updateForm} className="flex flex-col gap-4">
        {update.error && <Alert tone="error">{update.error}</Alert>}

        <input type="hidden" name="id" value={account.id} />

        <TextField
          name="name"
          label="Name"
          maxLength={80}
          required
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          error={update.fieldErrors?.name}
        />

        <SelectField
          name="kind"
          label="Type"
          value={draft.kind}
          onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </SelectField>
      </form>

      {/*
        The breakdown sits between the identity fields and the correction form because
        it answers the question the correction form asks. Someone correcting a balance
        is doing it because the balance is wrong, and this is where they see what it
        is made of before deciding how far off it is.
      */}
      <div className="mt-5 flex flex-col gap-2">
        <h3 className="tk-section">Where this balance comes from</h3>
        <AccountBalanceBreakdown account={account} />
      </div>

      {/*
        The correction is its own form with its own submit, not a field on the form
        above. Two reasons: the two actions mean different things and one Save button
        cannot honestly mean both; and posting a correction should not also write the
        name field, so a user who typed a new name and then corrected the balance does
        not lose the name to a surprising overwrite.

        It is also a separate component, and that is the reset. Recording a correction
        has to clear the amount field — leaving a posted figure in the box invites the
        user to submit it again — but doing that from an effect means setState in an
        effect, which cascades a render on every successful post. Keying the component
        on the count of recorded corrections gives the same reset for free: each post
        makes the count grow, so React mounts a fresh instance with an empty draft. No
        effect, no extra state, and the field clears on the render the post caused.
      */}
      <AccountCorrectionForm
        key={adjustments.data?.length ?? 0}
        account={account}
        recorded={adjustments.data ?? []}
      />

      {/*
        Removal and archiving are offered together because only one of them is
        correct for any given account, and the user knows which: an account with no
        transactions can be removed, and one with history can only be archived.
        `deleteAccount` counts first and explains itself rather than surfacing a
        foreign-key error, so pressing Remove on an account with history tells them
        that instead of failing obscurely.
      */}
      <div className="tk-card-flat mt-5 flex flex-col gap-3">
        <form id={removeFormId} action={removeForm} className="contents">
          <input type="hidden" name="id" value={account.id} />
        </form>

        {remove.error && <Alert tone="error">{remove.error}</Alert>}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            form={removeFormId}
            name="archive"
            value="true"
            disabled={removePending}
            className={buttonClass('quiet', { size: 'sm' })}
          >
            Archive instead
          </button>
          <button
            type="submit"
            form={removeFormId}
            disabled={removePending}
            className={buttonClass('quiet', { size: 'sm' })}
          >
            Remove account
          </button>
          <span className="tk-caption">Removing works only if it has no transactions yet.</span>
        </div>
      </div>
    </Modal>
  )
}