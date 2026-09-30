---
name: Security Review
description: Security checklist for auth, RLS, authorization, input validation, and secret handling in TakaKori. Load before finishing any task that touches authentication, data access, Server Actions, or API routes.
---

# Security review

Run through this before declaring any task complete that touches auth, data
access, Server Actions, or Route Handlers.

## The one test that matters

**Can User A read or modify User B's data by changing a UUID?**

```
1. Sign up user A and user B (two browsers, or one normal + one private window)
2. As A, create a transaction; note its id
3. As B, request that id directly
4. Expect: zero rows / permission denied
```

This is not a code-review item. Run it. RLS policies that look correct can still
be defeated by a missing `WITH CHECK`, a view without `security_invoker`, or a
`SECURITY DEFINER` function that forgot to check `auth.uid()`.

## Authorization

- [ ] Every Server Action calls `requireUser()` or `requireWorkspaceId()`.
- [ ] `proxy.ts` is treated as a redirect convenience, **not** a security
      boundary. The Next.js docs warn that a proxy matcher excluding a path also
      skips Server Function calls on that path.
- [ ] `workspace_id` is never taken from a request body on `update`. It is
      derived from the session.
- [ ] Every query filters by `workspace_id` as well as relying on RLS.
- [ ] Every `PATCH`/`DELETE` filters on the primary key. An unfiltered
      `DELETE` removes every row in the table.

## Input validation

- [ ] Zod schema applied **on the server**, not only in the form.
- [ ] UUIDs validated as UUIDs (rejects injection payloads).
- [ ] Amounts validated as strings before conversion (see `financial-data`).
- [ ] Dates validated as real calendar dates. `Date.parse('2026-02-30')`
      returns a **valid timestamp for 2026-03-02**, so an `isNaN` check is not
      enough — round-trip comparison is required.
- [ ] Errors returned to the user do not leak schema details, stack traces, or
      whether a given UUID exists.

## Server/client boundary

- [ ] No service-role key anywhere in `src/`, and never behind `NEXT_PUBLIC_`.
- [ ] `.env.local` gitignored; `.env.example` contains placeholders only.
- [ ] No secret, session token, or full auth user object in a log line.
- [ ] Data fetched in a Server Component is passed to Client Components as
      props rather than re-fetched client-side over PostgREST.

## RLS

- [ ] RLS enabled on every table in `public`.
- [ ] All four verbs covered where the app writes.
- [ ] `auth.uid()` wrapped in `(select ...)` in every policy.
- [ ] `WITH CHECK` present on `insert` and `update`.
- [ ] Index on every column used in a policy.
- [ ] Views use `security_invoker = true`. Without it, a view executes as its
      owner and bypasses RLS on the underlying tables.

## Cross-tenant integrity

RLS controls who may read and write. It does **not** stop a member of workspace
A inserting a row referencing workspace B's account, because the foreign key is
satisfied and RLS never sees the other side.

`private.assert_same_workspace()` covers `account_id`,
`counterparty_account_id`, and `category_id`. Any new table with cross-table
references needs the same treatment.

## Reporting

State what was checked and what was not. "RLS verified by test" is a claim the
user can trust; "RLS looks correct" is not.