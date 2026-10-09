'use client'

import { useEffect, useId, useState } from 'react'
import { useWriteInvalidation } from '@/lib/client/useWriteInvalidation'
import { deleteCategoryAction, updateCategoryAction, type ActionState } from '@/actions/transactions'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { TextField } from '@/components/ui/Field'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { buttonClass } from '@/components/ui/button'
import { useWriteAction } from '@/lib/client/useWriteAction'
import { useWriteToast } from '@/lib/client/useWriteToast'
import type { Category } from '@/lib/queries/reference'
import type { CategoryType } from '@/types/database'

const TYPES = [
  { value: 'expense' as CategoryType, label: 'Expense' },
  { value: 'income' as CategoryType, label: 'Income' },
]

/**
 * Renaming or removing a category.
 *
 * **Renaming is the common case and it is safe.** Transactions point at
 * `category_id`, never at the name, so every past transaction simply follows the new
 * name — which is why this sheet can offer a rename with no warning about history.
 *
 * **Removing needs no count and no "are you sure" about your records**, because
 * `category_id` is `on delete set null`: the transactions survive as orphans and
 * Reports already renders those as "Uncategorised" rather than dropping them. The
 * caption says so, because a user who deletes a category and then finds "Uncategorised"
 * in their reports should recognise it rather than think the app lost something.
 *
 * **The type is editable too**, and that is a real consequence: moving a category
 * from expense to income reclassifies every transaction that points at it. It is
 * offered because a category created on the wrong side is a mistake worth fixing, and
 * the segmented control makes the change visible rather than hidden.
 */
export function CategoryEditSheet({
  category,
  open,
  onClose,
}: {
  category: Category
  open: boolean
  onClose: () => void
}) {
  const [update, updateForm, updatePending, updateAttempt] = useWriteAction<ActionState>(
    updateCategoryAction,
    {},
    { queueKind: 'category.update' },
  )
  const [remove, removeForm, removePending, removeAttempt] = useWriteAction<ActionState>(deleteCategoryAction, {})

  const [draft, setDraft] = useState({ name: category.name, type: category.type })

  const formId = useId()

  useWriteInvalidation(update.success, 'category', updateAttempt)
  useWriteInvalidation(remove.success, 'category', removeAttempt)

  /**
   * Both writes close this sheet on success, and a toast is the only thing left on
   * screen afterwards. Without it, renaming or removing a category gave no
   * confirmation at all — the sheet closed and the list looked the same, or shorter,
   * with nothing having said which happened.
   */
  useWriteToast(update, updateAttempt, 'Category renamed.')
  useWriteToast(remove, removeAttempt, 'Category removed.')

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
      title="Edit category"
      description="Transactions follow the new name."
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

        <input type="hidden" name="id" value={category.id} />

        <SegmentedControl
          name="type"
          ariaLabel="Type"
          value={draft.type}
          options={TYPES}
          onChange={(value: string) => setDraft((d) => ({ ...d, type: value as CategoryType }))}
        />

        <TextField
          name="name"
          label="Name"
          maxLength={50}
          required
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          error={update.fieldErrors?.name}
        />
      </form>

      {/*
        The remove section is a **sibling** form, not a nested one.

        It used to sit inside the form above, with the button pointing at it through the
        HTML `form` attribute. HTML does not allow a form inside a form: the parser drops
        the inner `<form>` start tag entirely, so `form={removeFormId}` referred to a
        form that was never created, the button submitted nothing, and **removing a
        category silently did nothing** — no error, no row, no change.

        The nesting was invisible to the gate because no test removed a category, and to
        the browser because it "worked" everywhere the sibling pattern was used. Two
        console errors and one runtime error were the only evidence, from the Next dev
        overlay, on a screen a user had to reach deliberately.

        Putting the button inside its own form also removes the `form=` attribute, which
        is what React complains about: a submit it did not initiate is
        "A React form was unexpectedly submitted", and the form's `action` never runs.
      */}
      <form action={removeForm} className="tk-card-flat mt-4 flex flex-col gap-3">
        <input type="hidden" name="id" value={category.id} />

        {remove.error && <Alert tone="error">{remove.error}</Alert>}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={removePending}
            className={buttonClass('quiet', { size: 'sm' })}
          >
            Remove category
          </button>
          <span className="tk-caption">
            Transactions keep their amounts and show as &ldquo;Uncategorised&rdquo;.
          </span>
        </div>
      </form>
    </Modal>
  )
}