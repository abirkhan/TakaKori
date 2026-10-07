/**
 * "Keep me signed in on this device".
 *
 * A Supabase session is two cookies: a short-lived access token and a refresh
 * token. `@supabase/ssr` writes them with whatever lifetime auth-js hands it,
 * which means a **session cookie** — it disappears when the browser closes. That
 * is the right default for a shared machine and the wrong one for a phone.
 *
 * ### Why the preference lives in a cookie and not in the token
 *
 * Because the session is refreshed, and *that* is where the naive version breaks.
 * Stamping a 30-day expiry at sign-in looks like it works — until auth-js
 * refreshes the token an hour later and rewrites the cookie with the default
 * short lifetime. "Remember me" would quietly stop working after an hour, for
 * most users, with nothing to indicate why. So the preference is stored
 * separately and applied on **every** write, including refreshes: `setAll` in both
 * `server.ts` and `proxy.ts` reads this cookie and stamps the auth cookies
 * accordingly. That is why the proxy takes part even though it is not where
 * sign-in happens.
 *
 * ### Why this cookie is not `httpOnly`
 *
 * It holds no secret — `"1"` or `"0"` — and the Google OAuth path runs entirely in
 * the browser (ADR-036), so the client has to be able to write it before kicking
 * off the redirect. The session cookies themselves stay `httpOnly`; that is
 * auth-js's doing and this module does not touch it.
 */

/** Namespace-prefixed so it cannot collide with a Supabase cookie. */
export const REMEMBER_COOKIE = 'tk.remember'

/**
 * 30 days.
 *
 * Long enough that an installed PWA on a phone does not ask weekly; short enough
 * that a lost phone eventually stops working without anyone hunting for a
 * "sign out everywhere" button. Matches the Supabase dashboard's own default
 * session length, so this does not outlive what Supabase would honour anyway.
 */
export const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30

/**
 * Supabase's auth cookies, including the `.0`/`.1` chunks a long session is split
 * into, plus the PKCE code verifier.
 *
 * Matching rather than blanket-applying is deliberate: this module is handed every
 * cookie Supabase asks to write, and reaching past the auth ones would quietly
 * give a theme preference the same 30-day life.
 */
const AUTH_COOKIE = /^sb-.*-auth-token(\.\d+)?$|^sb-.*-auth-token-code-verifier$/

type CookieList = readonly { name: string; value: string }[]

/** Reads the preference. Absent means "no" — a session cookie, the safe default. */
export function wantsRemember(cookies: CookieList): boolean {
  return cookies.some((c) => c.name === REMEMBER_COOKIE && c.value === '1')
}

/** A checkbox is present-and-checked or absent; there is no third state. */
export function rememberFromForm(formData: FormData): boolean {
  return formData.get('remember') !== null
}

/**
 * The lifetime to write an auth cookie with.
 *
 * When not remembering, **both** `maxAge` and `expires` are removed. Stripping
 * only `maxAge` is the subtle bug: auth-js supplies `expires` alongside it for
 * the access token, and a cookie with an `expires` in the future is a persistent
 * cookie whatever its `maxAge` says. "Keep me signed in" unchecked has to remove
 * the expiry, not just shorten it.
 */
export function withRemember<T extends object>(name: string, options: T, remember: boolean): T {
  // Non-auth cookies are left exactly as auth-js asked for them.
  if (!AUTH_COOKIE.test(name)) return options

  if (!remember) {
    // Copied and deleted rather than destructured-to-omit: the omit idiom needs
    // throwaway bindings, and those read as unused to the linter.
    const rest = { ...options } as Record<string, unknown>
    delete rest.maxAge
    delete rest.expires
    return rest as T
  }

  return { ...options, maxAge: REMEMBER_MAX_AGE, expires: undefined }
}

/** Where and how the preference itself is stored. */
export function rememberCookieOptions() {
  return {
    path: '/',
    sameSite: 'lax' as const,
    // Not httpOnly, and not a secret: see the module note.
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    // The preference outlives the session it governs — it has to, or a
    // "remember me" user would be silently forgotten the first time their session
    // expired and refreshed.
    maxAge: REMEMBER_MAX_AGE,
  }
}

/**
 * The same cookie, for `document.cookie`.
 *
 * Needed because the Google flow runs entirely in the browser (ADR-036) and has to
 * set the preference before it redirects. `document.cookie` silently ignores
 * `httpOnly` and `sameSite` — they are not settable from script — so this carries
 * only the attributes that can actually be written, and the server-side writer
 * above keeps the rest.
 */
export function rememberCookieString(remember: boolean): string {
  const parts = [
    `${REMEMBER_COOKIE}=${remember ? '1' : '0'}`,
    'path=/',
    `max-age=${REMEMBER_MAX_AGE}`,
  ]
  if (process.env.NODE_ENV === 'production') parts.push('secure')
  return parts.join('; ')
}
