import { describe, it, expect, vi, afterEach } from 'vitest'
import { siteUrl } from './site-url'

/**
 * The auth redirect origin.
 *
 * This is worth a unit test because the failure is invisible: a wrong origin
 * still produces a well-formed URL, Supabase still accepts the request, and the
 * user only finds out when the link does nothing. That is exactly how the OAuth
 * route ended up building callbacks from the Netlify deploy URL.
 */
describe('siteUrl', () => {
  afterEach(() => {
    // stubEnv is the supported way to fake NODE_ENV, which is read-only on the
    // process.env type.
    vi.unstubAllEnvs()
  })

  it('uses the configured origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://takakori.netlify.app')
    expect(siteUrl()).toBe('https://takakori.netlify.app')
  })

  it('strips a trailing slash so callers can append a path', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://takakori.netlify.app/')
    expect(siteUrl()).toBe('https://takakori.netlify.app')

    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://takakori.netlify.app///')
    expect(siteUrl()).toBe('https://takakori.netlify.app')
  })

  it('falls back to localhost in development', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    vi.stubEnv('NODE_ENV', 'development')
    expect(siteUrl()).toBe('http://localhost:3000')
  })

  it('throws in production rather than guessing an origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    vi.stubEnv('NODE_ENV', 'production')
    // A silent fallback is what made this bug hard to see: the link looked
    // right and failed only when the user clicked it.
    expect(() => siteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/)
  })

  it('ignores Netlify deploy metadata in favour of the configured origin', () => {
    // URL is set to the deploy URL on Netlify, and to a preview subdomain for
    // branch deploys. Trusting it sends auth callbacks to a preview host.
    vi.stubEnv('URL', 'https://6abe50ca--takakori.netlify.app')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://takakori.netlify.app')
    expect(siteUrl()).toBe('https://takakori.netlify.app')
  })
})
