import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createAdjustment, deleteAdjustment, updateAccount } from './reference'

/**
 * The write shapes that move money.
 *
 * These tests exist because the interesting failure modes here are *silent*. A wrong
 * filter produces a thrown error or a visible wrong number; the bugs worth pinning are
 * the ones that pass a green run and quietly do the wrong thing — every row updated,
 * or a balance written as `'0.00'` because a form field was absent.
 */
type Result = { data: unknown; error: { message: string } | null }

/** The body handed to a builder, which is what these assertions are actually about. */
function patchOf(chain: { update: { mock: { calls: unknown[][] } } }): Record<string, unknown> {
  return chain.update.mock.calls[0][0] as Record<string, unknown>
}

/**
 * A stand-in for a PostgREST query builder.
 *
 * Every builder method returns the same chain, so a call recorded on any of them is
 * visible from any other. The reference layer only ever chains, so a faithful double is
 * just "the same object returned until the terminal await".
 */
function makeCtx() {
  const chain: Record<string, unknown> = {}
  const build = {
    select: vi.fn(() => build),
    single: vi.fn(async (): Promise<Result> => ({ data: { id: 'x' }, error: null })),
    eq: vi.fn(() => build),
    insert: vi.fn(() => build),
    update: vi.fn(() => build),
    delete: vi.fn(() => build),
  }
  Object.assign(chain, build)
  const supabase = {
    from: vi.fn(() => build),
    insert: vi.fn(() => build),
    update: vi.fn(() => build),
    delete: vi.fn(() => build),
  }
  return { supabase, chain: build, ctx: { supabase, workspaceId: 'ws-1' } as never }
}

beforeEach(() => vi.clearAllMocks())

describe('deleteAdjustment', () => {
  it('filters by id', async () => {
    // Rule 4, and the reason this file exists. PostgREST matches *every* row when the
    // filter is absent, so a delete without `.eq('id', …)` removes the user's entire
    // ledger of corrections and reports success.
    const { chain, ctx } = makeCtx()
    await deleteAdjustment(ctx, { id: 'adj-1' })
    expect(chain.eq).toHaveBeenCalledWith('id', 'adj-1')
  })

  it('also filters by workspace', async () => {
    const { chain, ctx } = makeCtx()
    await deleteAdjustment(ctx, { id: 'adj-1' })
    expect(chain.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
  })
})

describe('updateAccount', () => {
  it('omits opening_balance entirely when the caller does not supply one', async () => {
    // The regression this pins. This project already shipped the bug it guards: an
    // account reading ৳5,000.00 with `opening_balance` 0.00, because a form that
    // omitted the field wrote `'0.00'` over a real balance. A patch is not a merge.
    const { chain, ctx } = makeCtx()
    await updateAccount(ctx, { id: 'acc-1', name: 'Cash', kind: 'cash' })
    expect('opening_balance' in patchOf(chain)).toBe(false)
  })

  it('does not send opening_balance as undefined either', async () => {
    // `undefined` would be dropped by JSON.stringify anyway, but asserting the key is
    // absent catches the more dangerous shape: a default parameter that fills it in.
    const { chain, ctx } = makeCtx()
    await updateAccount(ctx, { id: 'acc-1', name: 'Cash', kind: 'cash', openingBalance: undefined })
    expect('opening_balance' in patchOf(chain)).toBe(false)
  })

  it('writes opening_balance when the caller does supply one', async () => {
    const { chain, ctx } = makeCtx()
    await updateAccount(ctx, { id: 'acc-1', name: 'Cash', kind: 'cash', openingBalance: '25.00' })
    expect(patchOf(chain)).toMatchObject({ opening_balance: '25.00' })
  })

  it('filters by id and workspace', async () => {
    const { chain, ctx } = makeCtx()
    await updateAccount(ctx, { id: 'acc-1', name: 'Cash', kind: 'cash' })
    expect(chain.eq).toHaveBeenCalledWith('id', 'acc-1')
    expect(chain.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
  })
})

describe('createAdjustment', () => {
  it('writes the amount as the decimal string the caller gave it', async () => {
    // `numeric` crosses PostgREST as a string. Converting here would put a float in a
    // money column.
    const { chain, ctx } = makeCtx()
    await createAdjustment(ctx, { accountId: 'acc-1', amount: '-123.45', reason: 'typo' })
    expect(chain.insert).toHaveBeenCalledWith({
      workspace_id: 'ws-1',
      account_id: 'acc-1',
      amount: '-123.45',
      reason: 'typo',
    })
  })

  it('stores an absent reason as null, not as an empty string', async () => {
    const { chain, ctx } = makeCtx()
    await createAdjustment(ctx, { accountId: 'acc-1', amount: '10.00' })
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ reason: null }))
  })

  it('turns a PostgREST error into a thrown one', async () => {
    const supabase = {
      from: vi.fn(() => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: { message: 'not in this workspace' } }),
          }),
        }),
      })),
    }
    await expect(
      createAdjustment({ supabase, workspaceId: 'ws-1' } as never, {
        accountId: 'acc-1',
        amount: '1.00',
      }),
    ).rejects.toThrow(/not in this workspace/)
  })
})