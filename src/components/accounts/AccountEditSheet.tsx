'use client'

import { useEffect, useId, useState } from 'react'
import { useWriteInvalidation } from '@/lib/client/useWriteInvalidation'
import { deleteAccountAction, updateAccountAction, type ActionState } from '@/actions/transactions'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { SelectField, TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'
import { useWriteAction } from '@/lib/client/useWriteAction'
import { toNumericString, toMinor } from '@/lib/money'
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
    openingBalance: toNumericString(toMinor(account.opening_balance)),
  }))

  const formId = useId()
  const removeFormId = useId()

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
      description="Correcting the opening balance changes what this account started at."
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

        <div className="grid gap-4 sm:grid-cols-2">
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

          <TextField
            name="openingBalance"
            label="Opening balance"
            inputMode="decimal"
            className="tabular-nums"
            value={draft.openingBalance}
            onChange={(e) => setDraft((d) => ({ ...d, openingBalance: e.target.value }))}
            error={update.fieldErrors?.openingBalance}
          />
        </div>

        {/*
          Removal and archiving are offered together because only one of them is
          correct for any given account, and the user knows which: an account with no
          transactions can be removed, and one with history can only be archived.
          `deleteAccount` counts first and explains itself rather than surfacing a
          foreign-key error, so pressing Remove on an account with history tells them
          that instead of failing obscurely.
        */}
        <div className="tk-card-flat mt-1 flex flex-col gap-3">
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
            <span className="tk-caption">
              Removing works only if it has no transactions yet.
            </span>
          </div>
        </div>
      </form>
    </Modal>
  )
}