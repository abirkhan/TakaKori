---
name: Task Execution
description: The read-plan-implement-verify-report workflow for any task in TakaKori, including what to read before editing and what must pass before reporting complete. Load at the start of every non-trivial task.
---

# Task execution

## Before writing code

1. **Read the relevant docs.** `docs/database.md` for schema work,
   `docs/security.md` for anything touching auth or data access,
   `docs/architecture.md` for structure. `docs/decisions.md` records _why_ — an
   ADR you have not read is an ADR you are about to violate.
2. **Read the code you are about to change**, and the code that already does
   something similar. Match the existing pattern.
3. **Check the database.** For schema questions, read `supabase/migrations/` —
   migrations are the source of truth, not the Supabase dashboard.
4. **State the plan in one or two sentences** before editing. If the approach
   is unclear, ask rather than guessing.

## While implementing

- Smallest change that solves the problem. No speculative abstraction.
- One new module at most per concern. Search before creating a second one.
- If you discover the task's premise is wrong, say so and stop. Do not
  implement around a bad assumption.
- Never edit a migration that has already been applied. Add a new one.
- Never change the schema through the dashboard.

## Before reporting complete

Run, in order, and do not skip steps:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint  — next lint was removed in Next 16
npm run test        # vitest run
npm run build       # next build — does NOT lint
```

Then review your own diff:

```bash
git diff
git status
```

Look for: secrets in the diff, an unfiltered `DELETE`, `user_id` added to a
business table, money arithmetic outside `lib/money.ts`, a `middleware.ts`, or a
generated file left uncommitted.

## Report format

```
TASK COMPLETE

Changed:
  - <file>: <what and why>

Database:
  - migration <name> added  (or: no schema change)

Verified:
  typecheck  pass
  lint       pass
  test       pass (N tests)
  build      pass

Security:
  - RLS verified: <what was tested, or "no data access touched">
  - secrets: none introduced

Known gaps:
  - <anything not done, or "none">
```

An honest "known gaps" section is worth more than a claim that everything is
complete. If something was not verified, say which thing and why.

## Drift warning

This codebase is on Next.js 16, where `middleware.ts` is dead, `next lint` is
removed, and `params`/`cookies()` are async. Training data says otherwise.
Before using a Next.js API you have not used in this repo, check
`node_modules/next/dist/docs/`.

Trust the bundled docs and the passing tests over recollection.
