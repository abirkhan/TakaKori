# TakaKori

Personal income and expense tracker for Bangladesh, built to grow into a
free platform for a wider audience.

Next.js 16 (App Router) · Supabase (Postgres + Auth + RLS) · Netlify · TypeScript

## Status

Phase 0 complete. See [`docs/roadmap.md`](docs/roadmap.md).

## Getting started

```bash
npm install
cp .env.example .env.local   # add your Supabase URL and publishable key
npm run dev
```

Database setup (requires `npx supabase login` once):

```bash
npx supabase link --project-ref <your-ref>
npx supabase db push
npx supabase gen types types/database.ts
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | development server |
| `npm run build` | production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (`next lint` was removed in Next 16) |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | Playwright E2E |
| `npm run verify` | typecheck → lint → test → build |

## Documentation

Start with [`AGENTS.md`](AGENTS.md), then:

- [`docs/architecture.md`](docs/architecture.md) — stack and structure
- [`docs/database.md`](docs/database.md) — schema and tenancy
- [`docs/security.md`](docs/security.md) — RLS and authorization
- [`docs/decisions.md`](docs/decisions.md) — why each choice was made
- [`docs/roadmap.md`](docs/roadmap.md) — phases

Agent operating rules live in [`.opencode/skills/`](.opencode/skills/).

## Conventions worth knowing before you write code

- Session refresh lives in `src/proxy.ts`. Next.js 16 renamed `middleware.ts`;
  the old name is silently ignored.
- Money crosses the API as a **string**. Use `src/lib/money.ts`; never do
  arithmetic on a raw amount.
- A `PATCH`/`DELETE` without an `.eq('id', id)` filter affects every row.
- RLS is the security boundary. Application code is never trusted to filter.
- Transfers are a transaction `type`, not a category, and are excluded from
  income and expense totals.
- All reporting ranges are computed in the user's timezone, never UTC.