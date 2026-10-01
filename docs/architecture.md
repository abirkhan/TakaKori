# Architecture

## Stack

| Layer      | Choice                             | Version        |
| ---------- | ---------------------------------- | -------------- |
| Framework  | Next.js (App Router, Turbopack)    | 16.3.8         |
| UI         | React Server Components by default | 19.2.8         |
| Language   | TypeScript strict                  | ~5.9.3         |
| Styling    | Tailwind CSS (CSS-first config)    | 4.3.3          |
| Database   | Supabase Postgres + Auth + RLS     | —              |
| Validation | Zod                                | 4.6.5          |
| Testing    | Vitest + Playwright                | 5.0.3 / 1.63.0 |
| Deploy     | Netlify (`@netlify/plugin-nextjs`) | 5.16.0         |

TypeScript is pinned below 7. npm's `latest` is now the Go-based 7.0 release;
the ESLint and Next.js integrations in this stack have not been validated
against it.

## Rendering model

Server Components fetch data; Client Components handle interaction.

```
Server Component (page.tsx)
  → requireUser()            session check
  → requireWorkspaceId()     tenancy check
  → Supabase query           RLS enforces access
  → render

Client Component (form.tsx)
  → <form action={serverAction}>
  → Server Action: re-validate, server-side validation
```

Rules:

- A page is a Server Component unless it needs state, effects, or browser APIs.
- Data fetching lives in Server Components. Do not fetch in `useEffect`.
- Mutating data happens in Server Actions, not client-side `fetch`.
- Client Components receive already-fetched data as props. They do not query
  Supabase directly except through `src/lib/supabase/client.ts` for
  auth-only interactions.

## Request lifecycle

```
request
  → src/proxy.ts                  refreshes the Supabase session
  → route/page
  → Server Component or Action
  → src/lib/auth.ts               requireUser() — real authorization
  → Supabase query                RLS enforces row access
```

`proxy.ts` is a **convenience redirect, not a security boundary.** The Next.js
docs warn that a proxy matcher which excludes a path also skips Server Function
calls on that path. Every Server Action and data query re-checks the session via
`requireUser()` / `requireWorkspaceId()`.

## Directory layout

```
src/
├── app/                    routes and layouts only
│   ├── (auth)/             login, signup, callback — unauthenticated
│   └── (dashboard)/        authenticated shell
├── components/
│   ├── ui/                 presentational primitives
│   ├── transactions/
│   ├── accounts/
│   └── charts/
├── lib/
│   ├── supabase/           client.ts, server.ts, proxy.ts
│   ├── money.ts            money representation and formatting
│   ├── dates.ts            timezone-aware range resolution
│   ├── validations.ts      Zod schemas
│   ├── auth.ts             requireUser / requireWorkspaceId
│   └── queries/            data access, one module per domain
├── actions/                Server Actions, grouped by domain
└── types/                  generated Supabase types
```

Keep route files thin. A page composes; it does not contain query logic.

## Module boundaries

- `lib/money.ts` is the **only** module that converts between minor units and
  decimal strings. Nothing else does money arithmetic.
- `lib/dates.ts` is the only module that resolves date ranges.
- `lib/queries/*` owns all Supabase reads and writes. Actions and components
  call into it; they do not build queries inline.
- `lib/validations.ts` is shared by forms and Server Actions so client and
  server validate identically.

## Caching

`cacheComponents` is **off**. Enabling PPR/`use cache` would allow a stale
financial total to be served. A balance must reflect the user's most recent
transaction. Revalidate explicitly with `revalidatePath()` after a mutation.

## Environment variables

| Variable                               | Scope       | Notes                                    |
| -------------------------------------- | ----------- | ---------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | public      | project URL                              |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public      | `sb_publishable_…`, browser-safe         |
| `SUPABASE_SERVICE_ROLE_KEY`            | server only | not currently used; never `NEXT_PUBLIC_` |

The service-role key bypasses RLS. Nothing in this repository needs it. If a
future task introduces one, that task must include a review of every call site.
