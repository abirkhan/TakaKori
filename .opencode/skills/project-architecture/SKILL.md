---
name: Project Architecture
description: Conventions for Next.js App Router structure, Server vs Client Components, module boundaries, and import paths in TakaKori. Load before adding routes, components, or moving files.
---

# Project architecture

## Stack facts

Next.js 16.3.8 with the App Router and Turbopack. React 19. TypeScript 5.9
(strict). Tailwind 4 (CSS-first config — there is no `tailwind.config.js`).
Supabase. Netlify.

Read `node_modules/next/dist/docs/` before relying on any Next.js API. This
version has breaking changes relative to most training data.

## Non-negotiables

1. **`middleware.ts` does not exist.** Request interception lives in
   `src/proxy.ts` and exports `proxy(request: NextRequest)`. Writing
   `middleware.ts` produces a file that is silently never called.
2. **`next lint` does not exist.** Lint with `npm run lint` (`eslint .`).
   `next build` does not lint.
3. **`params`, `searchParams`, `cookies()`, and `headers()` are async.**
   Always `await` them.
4. Route files stay thin. A page composes components; it does not contain query
   logic. Move that to `lib/queries/`.
5. Server Components fetch data. No `useEffect` data fetching.

## Server vs Client

Add `'use client'` only when a component genuinely needs state, effects,
event handlers, or a browser API. A form that posts to a Server Action does not
need it.

Do not mark a whole page or layout `'use client'` for convenience. It forces the
entire subtree through the client bundle and forfeits streaming.

## Where code goes

| Code | Location |
|---|---|
| Page, layout, route handler | `src/app/` |
| Reusable UI | `src/components/ui/` |
| Domain UI | `src/components/<domain>/` |
| Supabase clients | `src/lib/supabase/` |
| Money | `src/lib/money.ts` |
| Date ranges | `src/lib/dates.ts` |
| Zod schemas | `src/lib/validations.ts` |
| Auth guards | `src/lib/auth.ts` |
| Data access | `src/lib/queries/` |
| Server Actions | `src/actions/` |

Import with the `@/` alias.

## Before creating a utility

Search first. `lib/money.ts`, `lib/dates.ts`, and `lib/validations.ts` already
exist precisely so this problem has one answer. A second date helper or money
formatter is a regression, not a contribution.

## Verification

```bash
npm run verify   # typecheck → lint → test → build
```

All four must pass before a task is complete. `verify` is the definition of
done; do not substitute "it should work".