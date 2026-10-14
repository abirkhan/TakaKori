import { describe, expect, it, vi, afterEach } from 'vitest'
import { errorSummary, reportError, type BoundaryError } from './report-error'

/**
 * The error copy is the part worth testing, and it is worth testing because two
 * boundaries saying different things about one failure is worse than one saying
 * nothing — a user cannot act on a contradiction.
 *
 * Every case below is a way this copy could tell a user something untrue, which in
 * a finance app is the failure mode the rest of the project keeps guarding against.
 */

function err(over: Partial<BoundaryError> = {}): BoundaryError {
  const e = new Error('boom') as BoundaryError
  Object.assign(e, over)
  return e
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('errorSummary', () => {
  it('distinguishes a server error from a client one, because the browser knows different things', () => {
    // Next replaces the message of a Server Component error in production, so the
    // app genuinely does not know what went wrong. The words must not imply it does.
    const server = errorSummary(err({ digest: 'abc123' }))
    const client = errorSummary(err())

    expect(server.title).not.toBe(client.title)
    expect(server.title).toMatch(/could not load/i)
    expect(client.title).toMatch(/stopped working/i)
  })

  /**
   * The ADR-043 mistake in a new place.
   *
   * "Nothing was changed" is the reassuring sentence, and it is not knowable: an
   * error boundary catches a failure to *render*, which can follow a write that
   * succeeded. The transaction is on the server and the screen failed to draw it.
   * Telling a user their money is safe because a component threw is exactly the
   * claim ADR-012 and ADR-043 exist to prevent.
   */
  it('never claims nothing was changed', () => {
    for (const error of [err(), err({ digest: 'abc123' })]) {
      const { description } = errorSummary(error)
      expect(description).not.toMatch(/nothing (was )?(changed|deleted|saved)/i)
      expect(description).not.toMatch(/your (data|money) is safe/i)
    }
  })

  /**
   * A named cause the app cannot support.
   *
   * "There may be a problem with the connection" was in the first draft. This
   * boundary catches render failures, and a render failure is more often a bug than
   * a network problem — so it sends someone to check their Wi-Fi instead of
   * reporting a defect.
   */
  it('does not guess at a cause', () => {
    for (const error of [err(), err({ digest: 'abc123' })]) {
      const { description } = errorSummary(error)
      expect(description).not.toMatch(/connection|network|offline|server is down/i)
    }
  })

  /** The design system's voice rules, applied to a screen nobody reviews. */
  it('follows the voice rules — no exclamation, no "something went wrong"', () => {
    for (const error of [err(), err({ digest: 'abc123' })]) {
      const { title, description } = errorSummary(error)
      for (const line of [title, description]) {
        expect(line).not.toMatch(/!/)
        expect(line).not.toMatch(/oops/i)
        expect(line).not.toMatch(/something went wrong/i)
      }
    }
  })

  /** Every error screen names a next action, or it is a dead end. */
  it('always offers a way forward', () => {
    for (const error of [err(), err({ digest: 'abc123' })]) {
      expect(errorSummary(error).description).toMatch(/try again/i)
    }
  })

  it('points at the reference code only when there is one to quote', () => {
    // A client error has no digest to quote, so asking for one would be a request
    // the user cannot fulfil.
    expect(errorSummary(err({ digest: 'abc123' })).description).toMatch(/reference code/i)
    expect(errorSummary(err()).description).not.toMatch(/reference code/i)
  })
})

describe('reportError', () => {
  it('logs the digest alongside the message, since it is the only correlation handle', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    reportError(err({ digest: 'abc123' }), 'dashboard boundary')

    expect(spy).toHaveBeenCalledTimes(1)
    const [, second] = spy.mock.calls[0]
    expect(second).toMatchObject({ digest: 'abc123' })
  })

  it('logs at error level, because warn is what lint and tests treat as noise', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportError(err(), 'root boundary')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('names the segment that failed, since the message alone is not enough to find it', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportError(err(), 'dashboard boundary')
    expect(String(spy.mock.calls[0][0])).toContain('dashboard boundary')
  })

  it('works with no digest at all, which is every client-side error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => reportError(err(), 'auth boundary')).not.toThrow()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
