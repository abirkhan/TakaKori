import { describe, expect, it } from 'vitest'
import {
  REMEMBER_COOKIE,
  REMEMBER_MAX_AGE,
  rememberCookieString,
  rememberFromForm,
  wantsRemember,
  withRemember,
} from './remember'

/**
 * The cookie lifetime is the whole feature, and it fails silently.
 *
 * Nothing about a wrong answer here is visible: the user signs in, sees a
 * dashboard, and only finds out weeks later that the browser had closed in
 * between. There is no error, no console line, and no failing request — which is
 * exactly why these are unit tests against the function rather than an E2E test
 * asserting that the app works.
 *
 * The bug this file exists to prevent is the obvious one. Stamping a 30-day expiry
 * at sign-in and stopping there *looks* correct, and then auth-js refreshes the
 * token an hour later and rewrites the cookie with the default short life. "Remember
 * me" quietly stops working for most users with nothing to indicate why. Hence
 * `withRemember` being applied on every write, including refreshes.
 */

const authCookie = 'sb-abc123-auth-token'
const chunked = 'sb-abc123-auth-token.1'
const verifier = 'sb-abc123-auth-token-code-verifier'
const unrelated = 'theme'

describe('wantsRemember', () => {
  it('is true only for an explicit yes', () => {
    expect(wantsRemember([{ name: REMEMBER_COOKIE, value: '1' }])).toBe(true)
  })

  it.each([
    ['an explicit no', [{ name: REMEMBER_COOKIE, value: '0' }]],
    ['an absent cookie', []],
    ['an unrelated cookie', [{ name: unrelated, value: '1' }]],
  ])('is false for %s', (_label, cookies) => {
    // Absent has to mean no: a stale preference from a previous sign-in on a
    // shared machine must not silently extend the next session.
    expect(wantsRemember(cookies)).toBe(false)
  })
})

describe('rememberFromForm', () => {
  it('is true when the checkbox is present, ticked or not', () => {
    // A checkbox posts nothing when unticked, so presence is the signal. Reading
    // the value instead would make "unticked" indistinguishable from "missing",
    // and the default-on path would then never see an off.
    expect(rememberFromForm(new FormData())).toBe(false)

    const ticked = new FormData()
    ticked.append('remember', 'on')
    expect(rememberFromForm(ticked)).toBe(true)
  })
})

describe('withRemember', () => {
  const base = { path: '/', httpOnly: true, sameSite: 'lax' } as const

  it('gives the session a 30-day life when remembering', () => {
    const out = withRemember(authCookie, { ...base, maxAge: 3600 }, true)
    expect(out.maxAge).toBe(REMEMBER_MAX_AGE)
    expect(out.maxAge).toBe(60 * 60 * 24 * 30)
  })

  it('removes both maxAge and expires when not remembering', () => {
    // The subtle half. auth-js supplies `expires` alongside `maxAge` for the access
    // token, and a cookie with a future `expires` is persistent whatever `maxAge`
    // says. Stripping only `maxAge` leaves "keep me signed in" unchecked still
    // keeping the user signed in.
    const out = withRemember(
      authCookie,
      { ...base, maxAge: 3600, expires: new Date(Date.now() + 3_600_000) },
      false,
    )
    expect(out.maxAge).toBeUndefined()
    expect('expires' in out).toBe(false)
  })

  it.each([
    ['a plain auth cookie', authCookie],
    ['a chunked one', chunked],
    ['the PKCE verifier', verifier],
  ])('applies to %s', (_label, name) => {
    expect(withRemember(name, { ...base, maxAge: 3600 }, true).maxAge).toBe(REMEMBER_MAX_AGE)
  })

  it('leaves a non-auth cookie exactly as auth-js asked', () => {
    // Matching rather than blanket-applying. Reaching past the auth cookies would
    // quietly give an unrelated preference the same 30-day life.
    const options = { ...base, maxAge: 3600 }
    expect(withRemember(unrelated, options, true)).toEqual(options)
    expect(withRemember(unrelated, options, false)).toEqual(options)
  })

  it('never leaves an object with maxAge: undefined in the remembered case', () => {
    // A bare `maxAge: undefined` key is not the same as no key to the cookie
    // serialiser in every runtime, so the remembered branch must set a number.
    const out = withRemember(authCookie, { ...base, maxAge: 3600 }, true)
    expect(typeof out.maxAge).toBe('number')
    expect(out.maxAge).toBe(REMEMBER_MAX_AGE)
  })
})

describe('rememberCookieString', () => {
  it('is writable by document.cookie', () => {
    const cookie = rememberCookieString(true)
    // Only these attributes are settable from script; `httpOnly` and `sameSite`
    // are not, and including them would suggest the browser is honouring them.
    expect(cookie).toContain(`${REMEMBER_COOKIE}=1`)
    expect(cookie).toContain(`max-age=${REMEMBER_MAX_AGE}`)
    expect(cookie).toContain('path=/')
    expect(cookie).not.toContain('httpOnly')
  })

  it('records the refusal as well as the consent', () => {
    expect(rememberCookieString(false)).toContain(`${REMEMBER_COOKIE}=0`)
  })
})
