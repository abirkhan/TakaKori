/**
 * Client instrumentation: service worker registration.
 *
 * This file runs after the document loads and before React hydrates, which is
 * the right window for a service worker. Registering from a component effect
 * would leave a gap on first load where the page is interactive and unprotected,
 * and registering from the root layout would put a side effect in a module whose
 * job is composing markup.
 *
 * **Four things this deliberately does not do**, each of which is a documented
 * way PWA updates go wrong:
 *
 * 1. **No timestamp or cache-buster on the URL.** Browsers cache a worker
 *    script for up to 24 hours, and appending `?Date.now()` to force a refresh
 *    is an anti-pattern: it makes the worker a *new* script every load, so the
 *    browser keeps every previous one alive as a separate registration.
 * 2. **`updateViaCache: 'none'`.** Since Chrome 68 the browser ignores HTTP
 *    cache headers when checking for a worker update, but not every browser has
 *    made that change. This opts out explicitly rather than relying on it.
 * 3. **No eager update.** `registration.update()` on every load would fight the
 *    browser's own update check and can install a worker mid-session. The
 *    browser does it on navigation.
 * 4. **No registration in development.** A cached shell is exactly the wrong
 *    thing to have while editing, and the failure is confusing rather than loud.
 *
 * The `netlify.toml` headers for `/sw.js` are the other half: `Cache-Control:
 * no-cache, no-store` there, because Netlify's CDN otherwise caches the worker
 * for the life of the deploy.
 */

if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // A failed registration is not worth interrupting anyone over. The app is
      // fully functional without a worker; it just cannot open offline. There is
      // no error UI for this on purpose — an alert about offline support would
      // appear on exactly the metered connections where the user can least afford
      // the interruption, and the failure is not actionable by them anyway.
    })
  })
}
