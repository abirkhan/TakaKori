import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createAdjustmentAction, updateAccountAction } from './transactions'
import * as server from '@/lib/queries/server'

/**
 * Balance corrections.
 *
 * The properties asserted here are the ones that fail *silently*. A rejected write
 * that reports an error is a bug someone notices; a write that succeeds while moving
 * the wrong money, or that quietly overwrites a balance with nothing, is not — which
 * is exactly the ADR-012 shape this project already paid for once.
 */
vi.mock('@/lib/queries/server', () => ({
  createAdjustment: vi.fn(async () => ({ id: 'a1' })),
  deleteAdjustment: vi.fn(async () => undefined),
  updateAccount: vi.fn(async () => ({ id: 'acc1' })),
  deleteAccount: vi.fn(async () => undefined),
  archiveAccount: vi.fn(async () => undefined),
}))

/**
 * `revalidatePath` throws outside a request — it needs the static generation store,
 * which only exists during a render. Mocked rather than let through, so a test can
 * assert on the write instead of on Next's internals.
 */
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

const ACCOUNT = '027b0fe3-0000-4000-8000-000000000000'

beforeEach(() => {
  vi.mocked(server.createAdjustment).mockClear()
  vi.mocked(server.updateAccount).mockClear()
})

describe('createAdjustmentAction', () => {
  const valid = { accountId: ACCOUNT, amount: '500', reason: 'Opened twice' }

  it('records a positive correction', async () => {
    const state = await createAdjustmentAction({}, form(valid))
    expect(state.error).toBeUndefined()
    expect(server.createAdjustment).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      amount: '500',
      reason: 'Opened twice',
    })
  })

  it('records a negative correction — a downward correction must be expressible', async () => {
    // A positive-only interface could not express "I over-stated this by 500", which
    // is the more common of the two mistakes.
    const state = await createAdjustmentAction({}, form({ ...valid, amount: '-500' }))
    expect(state.error).toBeUndefined()
    expect(server.createAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '-500' }),
    )
  })

  it('sends the amount as a decimal string, never a JS number', async () => {
    // `numeric` crosses the boundary as a string. A number here is how "1234.56"
    // becomes 1234.5599999999999 in someone's balance.
    await createAdjustmentAction({}, form({ ...valid, amount: '1234.56' }))
    expect(server.createAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '1234.56' }),
    )
  })

  it('refuses an empty amount rather than storing zero', async () => {
    const state = await createAdjustmentAction({}, form({ ...valid, amount: '' }))
    expect(state.fieldErrors?.amount).toBeDefined()
    expect(server.createAdjustment).not.toHaveBeenCalled()
  })

  it('refuses a zero correction, which would sit in the ledger saying nothing', async () => {
    const state = await createAdjustmentAction({}, form({ ...valid, amount: '0' }))
    expect(state.error).toMatch(/would not change/i)
    expect(server.createAdjustment).not.toHaveBeenCalled()
  })

  it('refuses a zero written as 0.00', async () => {
    const state = await createAdjustmentAction({}, form({ ...valid, amount: '0.00' }))
    expect(state.error).toMatch(/would not change/i)
    expect(server.createAdjustment).not.toHaveBeenCalled()
  })

  it('refuses more than two decimal places', async () => {
    // Three places cannot be stored exactly in numeric(14,2), and a value silently
    // rounded is a balance that no longer reconciles with what the user typed.
    const state = await createAdjustmentAction({}, form({ ...valid, amount: '1.005' }))
    expect(state.fieldErrors?.amount).toBeDefined()
    expect(server.createAdjustment).not.toHaveBeenCalled()
  })

  it('refuses thousands separators', async () => {
    // Accepting them would mean stripping them here or letting numeric() reject the
    // row later; neither is worth the ambiguity.
    const state = await createAdjustmentAction({}, form({ ...valid, amount: '1,000' }))
    expect(state.fieldErrors?.amount).toBeDefined()
    expect(server.createAdjustment).not.toHaveBeenCalled()
  })

  it('refuses a non-numeric amount', async () => {
    const state = await createAdjustmentAction({}, form({ ...valid, amount: 'abc' }))
    expect(state.fieldErrors?.amount).toBeDefined()
    expect(server.createAdjustment).not.toHaveBeenCalled()
  })

  it('treats an empty reason as absent rather than as an empty string', async () => {
    await createAdjustmentAction({}, form({ ...valid, reason: '' }))
    expect(server.createAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ reason: undefined }),
    )
  })

  it('refuses a reason past the column length', async () => {
    const state = await createAdjustmentAction({}, form({ ...valid, reason: 'x'.repeat(201) }))
    expect(state.fieldErrors?.reason).toBeDefined()
    expect(server.createAdjustment).not.toHaveBeenCalled()
  })

  it('reports a failure from the write instead of claiming success', async () => {
    vi.mocked(server.createAdjustment).mockRejectedValueOnce(new Error('That account is not in this workspace.'))
    const state = await createAdjustmentAction({}, form(valid))
    expect(state.success).toBeUndefined()
    expect(state.error).toMatch(/not in this workspace/)
  })

  /**
   * The sheet keys its correction form on this id, and the key is the reset: a post
   * that returns nothing would leave the posted amount sitting in the field, where the
   * next tap writes it again.
   */
  it('returns the created id, so the caller can key a remount on it', async () => {
    vi.mocked(server.createAdjustment).mockResolvedValueOnce({ id: 'adj-9' } as never)
    const state = await createAdjustmentAction({}, form(valid))
    expect(state.createdId).toBe('adj-9')
  })

  it('returns no id on failure, so a rejected post cannot clear the draft', async () => {
    vi.mocked(server.createAdjustment).mockRejectedValueOnce(new Error('nope'))
    const state = await createAdjustmentAction({}, form(valid))
    expect(state.createdId).toBeUndefined()
  })

  it('returns a distinct id per post, since the success message does not vary', async () => {
    vi.mocked(server.createAdjustment).mockResolvedValueOnce({ id: 'adj-1' } as never)
    vi.mocked(server.createAdjustment).mockResolvedValueOnce({ id: 'adj-2' } as never)
    const first = await createAdjustmentAction({}, form(valid))
    const second = await createAdjustmentAction({}, form(valid))
    // Both say "Correction recorded". Keying a remount on `success` would therefore
    // never change the key, and the field would keep the posted figure after the
    // second correction — the exact failure the id exists to prevent.
    expect(first.success).toBe(second.success)
    expect(first.createdId).not.toBe(second.createdId)
  })
})

describe('updateAccountAction', () => {
  /**
   * The regression this pins.
   *
   * `openingBalance` used to be required here, because a PATCH is not a merge: a form
   * that omitted it wrote `'0.00'` over a real balance. That requirement is gone, and
   * the hazard moved into `updateAccount`, which omits the key entirely. What matters
   * at this level is that an edit which says nothing about the opening balance does not
   * mention one at all — so nothing downstream can infer `'0.00'` from its absence.
   */
  it('never sends an opening balance the user did not ask to change', async () => {
    const state = await updateAccountAction(
      {},
      form({ id: ACCOUNT, name: 'Cash', kind: 'cash' }),
    )
    expect(state.error).toBeUndefined()
    expect(server.updateAccount).toHaveBeenCalledWith({
      id: ACCOUNT,
      name: 'Cash',
      kind: 'cash',
    })
    const arg = vi.mocked(server.updateAccount).mock.calls[0][0]
    expect('openingBalance' in arg).toBe(false)
  })

  it('still renames and retypes an account', async () => {
    await updateAccountAction({}, form({ id: ACCOUNT, name: '  Cash  ', kind: 'mobile' }))
    expect(server.updateAccount).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Cash', kind: 'mobile' }),
    )
  })

  it('refuses an empty name', async () => {
    const state = await updateAccountAction({}, form({ id: ACCOUNT, name: '   ', kind: 'cash' }))
    expect(state.fieldErrors?.name).toBeDefined()
    expect(server.updateAccount).not.toHaveBeenCalled()
  })

  it('refuses an unknown account kind', async () => {
    const state = await updateAccountAction({}, form({ id: ACCOUNT, name: 'Cash', kind: 'yacht' }))
    expect(state.fieldErrors?.kind).toBeDefined()
    expect(server.updateAccount).not.toHaveBeenCalled()
  })
})