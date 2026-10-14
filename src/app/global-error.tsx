'use client'

import { useEffect } from 'react'
import { errorSummary, reportError } from '@/lib/report-error'

/**
 * The last-resort boundary: an error in the **root layout**.
 *
 * `error.tsx` does not wrap the `layout.tsx` above it in its own segment, so an
 * error thrown by `app/layout.tsx` — or by anything it renders, including the
 * offline banner and the pending-writes list — escapes every other boundary in the
 * app. This is the one that catches it. Without it, Next renders its default,
 * which is unstyled, offers no way back, and reports nothing.
 *
 * ### Why nothing here is shared with `ErrorScreen`
 *
 * **This file replaces the root layout, and the root layout is what loads
 * `globals.css` and the Geist font variables.** So none of it survives: `.tk-card`,
 * `--canvas`, `--content`, `--font-geist-sans` are all absent here, and reusing the
 * shared component would render an unstyled `<main>` with invisible text. That is
 * why this looks hand-rolled rather than like the rest of the app — it is the one
 * screen in TakaKori that genuinely cannot use the design system, because the
 * design system's stylesheet is what broke.
 *
 * The values below are the *same* tokens, copied from `globals.css`, in a `<style>`
 * block rather than a custom property. Two places to keep in step is a real cost
 * and it is noted in `docs/design-system.md`; the alternative is shipping a white
 * page with default text on it, which is the failure this file exists to prevent.
 *
 * The dark block mirrors the app's `@media (prefers-color-scheme: dark)` for the
 * same reason. A user on a dark phone should not get a white page because the
 * failure they hit happened to be this one.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    reportError(error, 'global boundary')
  }, [error])

  const summary = errorSummary(error)

  return (
    <html lang="en">
      <head>
        {/* `metadata` exports are unsupported here — this is a Client Component —
            so the title is React's own element, as the Next docs specify. */}
        <title>TakaKori</title>
        <style>{`
          /* Tokens copied from globals.css :root. Not a custom property: there is no
             stylesheet to define one in. */
          :root { color-scheme: light dark; }
          body {
            margin: 0;
            background-color: #f2f5f4;
            color: #142025;
            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
            display: flex;
            min-height: 100dvh;
            align-items: center;
            justify-content: center;
            padding: 1.25rem;
          }
          .card {
            background-color: #ffffff;
            border-radius: 24px;
            padding: 1.75rem;
            max-width: 26rem;
            box-shadow: 0 1px 2px rgb(20 32 37 / 0.04), 0 10px 30px -18px rgb(20 32 37 / 0.18);
          }
          h1 { font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 0.5rem; }
          p { font-size: 0.9375rem; line-height: 1.5; margin: 0 0 1.25rem; color: #566a72; }
          code { font-family: ui-monospace, Menlo, Consolas, monospace; }
          .ref { font-size: 0.8125rem; color: #566a72; margin: 0 0 1.5rem; }
          button {
            font: inherit;
            font-weight: 600;
            color: #ffffff;
            background-color: #0a8256;
            border: 0;
            border-radius: 999px;
            padding: 0.875rem 1.5rem;
            min-height: 3rem;
            cursor: pointer;
          }
          @media (prefers-color-scheme: dark) {
            body { background-color: #0b1316; color: #e7efec; }
            .card { background-color: #121d21; }
            p, .ref { color: #95a7ad; }
            button { background-color: #2fc590; color: #04140e; }
          }
        `}</style>
      </head>
      <body>
        <div className="card" role="alert">
          <h1>{summary.title}</h1>
          <p>{summary.description}</p>
          {error.digest && (
            <p className="ref">
              Reference code: <code>{error.digest}</code>
            </p>
          )}
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
