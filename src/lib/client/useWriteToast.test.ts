import { describe, expect, it } from 'vitest'
import { toastMessage } from './useWriteToast'

/**
 * What a user is told after a write.
 *
 * **This exists because I wired one up wrong and nothing noticed.** I passed a fourth
 * argument to `useWriteToast` intending it as a second success message, for the
 * "restored" case. It is the *queued* wording. So archiving announced "Account removed"
 * and restoring announced "Saved on this device" — both wrong, both shipped behind a
 * green gate, and neither visible afterwards because the toast had already gone.
 *
 * The rule these pin: **omit the message and the action's own wording is used.** An
 * action that can end in more than one way already words each of them, so a caller that
 * restates them can only get them out of step.
 *
 * `toastMessage` is exported because the suite runs in node with no DOM and the hook
 * cannot be mounted here; this is the part that was wrong.
 */
describe('toastMessage', () => {
  it('says the action\'s own wording when no message is given', () => {
    expect(toastMessage({ success: 'Account archived' })).toBe('Account archived')
  })

  /**
   * The three outcomes `deleteAccountAction` can produce. All three close the sheet, so
   * this toast is the only thing left to tell them apart.
   */
  it.each(['Account archived', 'Account restored', 'Account removed'])(
    'passes "%s" through untouched',
    (fromAction) => {
      expect(toastMessage({ success: fromAction })).toBe(fromAction)
    },
  )

  it('uses an explicit message where one is given', () => {
    expect(toastMessage({ success: 'Category removed' }, 'Category deleted.')).toBe(
      'Category deleted.',
    )
  })

  /**
   * The wiring mistake, pinned so the fourth argument's meaning cannot change quietly
   * again: it is the *offline* wording, not a second success message.
   */
  it('gives a queued write the offline wording, not the success message', () => {
    expect(toastMessage({ success: 'Account restored', queued: true }, 'Account removed.', 'Account restored')).toBe(
      'Account restored',
    )
  })

  it('prefers the offline wording even when the caller names a success message', () => {
    // "Expense saved" for an entry sitting in IndexedDB is the claim ADR-043 forbids.
    expect(toastMessage({ success: 'Expense saved', queued: true }, 'Expense saved.')).toMatch(
      /saved on this device/i,
    )
  })

  it('defaults a queued write to the offline wording', () => {
    expect(toastMessage({ success: 'Expense saved', queued: true })).toMatch(
      /saved on this device/i,
    )
  })

  it('falls back to an empty string with nothing to say', () => {
    // The hook guards on `success === undefined` before calling this, so this is only
    // reachable defensively. Empty rather than `undefined`, because `notifySuccess`
    // renders its argument.
    expect(toastMessage({})).toBe('')
  })
})