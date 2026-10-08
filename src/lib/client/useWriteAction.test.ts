import { describe, expect, it } from 'vitest'
import {
  writeOutcome,
  BLOCKED_ERROR,
  TIMEOUT_ERROR,
  DEFAULT_TIMEOUT_MS,
} from './useWriteAction'

/**
 * Only the pure decision is unit-tested. Whether the button actually comes back is
 * a question about React's transition timing, and asserting that here would be
 * asserting the mock — so it is verified in a real browser instead, with the
 * network severed, which is how the bug was found in the first place.
 */
describe('writeOutcome', () => {
  it("returns React's own state when nothing went wrong locally", () => {
    const reactState = { success: 'Transaction saved.' }
    expect(writeOutcome(reactState, null)).toEqual(reactState)
  })

  it('reports a blocked write rather than React silence', () => {
    const result = writeOutcome({}, BLOCKED_ERROR)
    expect(result).toEqual({ error: BLOCKED_ERROR })
  })

  it('reports a timed-out write rather than React silence', () => {
    expect(writeOutcome({}, TIMEOUT_ERROR)).toEqual({ error: TIMEOUT_ERROR })
  })

  it('overrides a success React has not produced yet', () => {
    // The shape that actually occurs: React still holds the previous state while
    // the round-trip is dead, so without this the form would render stale success.
    expect(writeOutcome({ success: 'Transaction saved.' }, TIMEOUT_ERROR)).toEqual({
      error: TIMEOUT_ERROR,
    })
  })

  it('does not let a local error masquerade as a field error', () => {
    // `fieldErrors` is what routes a message inline beside a field instead of
    // through the toast path. A transport failure has no field, so it must not
    // acquire one.
    expect(writeOutcome({}, TIMEOUT_ERROR).fieldErrors).toBeUndefined()
  })
})

describe('the two failure messages', () => {
  it('says a blocked write did not save, because it never reached the server', () => {
    expect(BLOCKED_ERROR).toMatch(/not saved/)
    expect(BLOCKED_ERROR).toMatch(/offline/i)
  })

  it('does not claim a timed-out write failed, because it may not have', () => {
    // The distinction the design turns on. A timeout means the app stopped
    // listening, not that the write was rejected — telling a user "that did not
    // save" is how a transaction ends up entered twice.
    expect(TIMEOUT_ERROR).not.toMatch(/not saved/)
    expect(TIMEOUT_ERROR).not.toMatch(/did not save/)
    expect(TIMEOUT_ERROR).toMatch(/could not confirm/i)
    expect(TIMEOUT_ERROR).toMatch(/refresh/i)
  })

  it('leaves room between the deadline and the point a user gives up', () => {
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000)
    expect(DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(30_000)
  })
})