<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TakaKori

Personal income/expense tracker. Next.js 16 + Supabase + Netlify, targeting
Bangladesh first and a wider audience later.

## Read before changing anything

| Document | Covers |
|---|---|
| `docs/architecture.md` | stack, rendering model, module boundaries |
| `docs/database.md` | schema, tenancy, migrations |
| `docs/security.md` | RLS, authorization, money handling |
| `docs/decisions.md` | why each architectural choice was made |
| `docs/roadmap.md` | phases and current status |

Skills in `.opencode/skills/` carry the operational rules. Load the relevant one
rather than re-deriving it: `project-architecture`, `supabase-development`,
`financial-data`, `security-review`, `testing`, `task-execution`.

## Hard rules

These are not preferences. Violating them produces silent, hard-to-debug bugs.

1. **`middleware.ts` does not exist.** Request interception is `src/proxy.ts`,
   exporting `proxy(request: NextRequest)`. The old filename is silently never
   called — sessions stop refreshing and users get logged out at random.
2. **`next lint` does not exist.** Run `npm run lint`. `next build` does not lint.
3. **Money is never a JS number.** `numeric` arrives as a string. All conversion
   goes through `src/lib/money.ts`; all aggregation happens in SQL.
4. **Never `PATCH` or `DELETE` without `.eq('id', id)`.** PostgREST matches every
   row when the filter is absent.
5. **Every policy wraps `auth.uid()` in a subquery.** `(select auth.uid())`
   evaluates once per query; bare `auth.uid()` evaluates once per row.
6. **`workspace_id` is the only tenancy key.** Business tables never carry
   `user_id`. Ownership derives through `workspace_members`.
7. **Date ranges are computed in the user's timezone**, never UTC.
8. **Transfers are not income or expense.** `type` is `income | expense |
   transfer`, and a transfer must have a `counterparty_account_id`.
9. **Migrations only.** Never change the schema through the Supabase dashboard.
10. **Never commit or expose the service-role key.** Nothing here needs it.

## Definition of done

```bash
npm run verify   # typecheck → lint → test → build
```

All four must pass. Then review `git diff` and report in the format given in the
`task-execution` skill, including an honest "known gaps" section.

"The implementation should work" is not a passing result. This project is built
by an agent that has to prove its work rather than assert it.

## Environment

```bash
npx supabase login                  # once, interactive
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase gen types types/database.ts
```

`supabase start` requires Docker, which is not installed. Database tests run
against the linked development project.
