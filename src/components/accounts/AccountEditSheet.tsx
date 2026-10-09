'use client'

import { useEffect, useId, useState } from 'react'
import { useWriteInvalidation } from '@/lib/client/useWriteInvalidation'
import {
  createAdjustmentAction,
  deleteAccountAction,
  updateAccountAction,
  type ActionState,
} from '@/actions/transactions'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { SelectField, TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'
import { useWriteAction } from '@/lib/client/useWriteAction'
import { useWriteToast } from '@/lib/client/useWriteToast'
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
  const [update, updateForm, updatePending, updateAttempt] = useWriteAction<ActionState>(
    updateAccountAction,
    {},
    { queueKind: 'account.update' },
  )
  const [remove, removeForm, removePending, removeAttempt] = useWriteAction<ActionState>(deleteAccountAction, {})
  const [adjust, adjustForm, adjustPending, adjustAttempt] = useWriteAction<ActionState>(
    createAdjustmentAction,
    {},
  )

  const [draft, setDraft] = useState(() => ({
    name: account.name,
    kind: account.kind,
  }))

  const formId = useId()

  const adjustments = useQuery(keys.adjustments(account.id), () => listAdjustments(account.id))

  useWriteInvalidation(update.success, 'account', updateAttempt)
  useWriteInvalidation(remove.success, 'account', removeAttempt)

  /**
   * Every write in this sheet closes it, so the toast is the only thing left standing.
   * Renaming an account or archiving it used to give no confirmation at all.
   */
  useWriteToast(update, updateAttempt, 'Account updated.')
  useWriteToast(remove, removeAttempt, 'Account removed.')
  useWriteInvalidation(adjust.success, 'account', adjustAttempt)

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
        Success goes to a toast, not to an inline Alert in this sheet.

        The correction form below is keyed on the id the action returned, so it remounts
        with an empty draft after a successful post — the reset that stops a posted
        figure sitting in the box where the next tap writes it twice. A remount destroys
        everything in that subtree, so an Alert inside it is destroyed on success too:
        the user records a correction and is told nothing. And a confirmation that
        appears and is immediately unmounted is worse than none at all, because a
        silent success and a lost write look identical.

        The toast is the app's answer to this everywhere else (`WriteForm`,
        `EditTransactionSheet`, `ConfirmDeleteSheet`), and it is the right one here for a
        second reason: the sheet has no `role="alert"`, so an Alert appearing above the
        fold of a scrolled modal body is not announced at all. The toast layer is a
        persistent `aria-live="polite"` region, so it is — to everyone, including a
        screen reader, and including when the sheet is scrolled.
      */}
      {/*
        The correction is its own form with its own submit, not a field on the form
        above. Two reasons: the two actions mean different things and one Save button
        cannot honestly mean both; and posting a correction should not also write the
        name field, so a user who typed a new name and then corrected the balance does
        not lose the name to a surprising overwrite.

        It is separate, and keyed on the returned id, because remounting is how the draft
        clears — the codebase's preferred reset over a setState-in-effect, which cascades
        a render on every post.

        **Keyed on the returned id, not on the number of recorded corrections.** The
        count was the first attempt and it is wrong in three ways. It is `0` while the
        read is in flight, so opening an account that already has corrections mounted
        this subtree twice and could discard a draft typed in that window. It is `0`
        again for the moment the post invalidates the cache, which is the only reason
        the reset worked at all — if that refetch failed, the key never changed, the
        posted amount stayed in the box, and the user's next tap wrote it twice. And the
        success string does not work either: it is the same words every time, so the key
        would not change. An id is unique per write, so it moves exactly when a write
        landed.
      */}
      <AccountCorrectionForm
        key={adjust.createdId ?? 'empty'}
        account={account}
        recorded={adjustments.data ?? []}
        form={adjustForm}
        pending={adjustPending}
        error={adjust.error}
        fieldErrors={adjust.fieldErrors}
        createdId={adjust.createdId}
      />

      {/*
        Removal and archiving are offered together because only one of them is
        correct for any given account, and the user knows which: an account with no
        transactions can be removed, and one with history can only be archived.
        `deleteAccount` counts first and explains itself rather than surfacing a
        foreign-key error, so pressing Remove on an account with history tells them
        that instead of failing obscurely.
      */}
      {/*
        A sibling form with the buttons **inside** it, rather than a separate form
        referenced with the HTML `form` attribute.

        Both forms here are React Server Action forms, and a submit React did not initiate
        raises "A React form was unexpectedly submitted" — the `action` never runs. It
        was silent in the account sheet only because the nesting bug in `CategoryEditSheet`
        was the loud one; this is the same latent shape, one layer along.

        Both buttons live in one form deliberately. "Archive instead" and "Remove account"
        are two answers to one question, and both submit the same id — differing only in
        the `name`/`value` pair the action reads — so they are one form with two submit
        buttons rather than two forms.
      */}
      <form action={removeForm} className="tk-card-flat mt-5 flex flex-col gap-3">
        <input type="hidden" name="id" value={account.id} />

        {remove.error && <Alert tone="error">{remove.error}</Alert>}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            name="archive"
            value="true"
            disabled={removePending}
            /**
             * Full size, not `.tk-btn-sm`.
             *
             * Both of these were 36px against the 48px minimum. They are destructive
             * controls on financial records, which is the least forgiving place for a
             * target you can miss — "Remove account" removes an account and everything
             * filed against it. The design system allows a small button "where there is
             * a reason"; density is not a reason for a control that deletes.
             */
            className={buttonClass('quiet')}
          >
            Archive instead
          </button>
          <button
            type="submit"
            disabled={removePending}
            className={buttonClass('quiet')}
          >
            Remove account
          </button>
          <span className="tk-caption">Removing works only if it has no transactions yet.</span>
        </div>
      </form>
    </Modal>
  )
}