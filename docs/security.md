# Security

## Model

Authorization is enforced by PostgreSQL Row Level Security. The application is
never trusted to filter data correctly.

A user who takes a transaction UUID from another account and requests it
receives zero rows. That guarantee lives in the database, not in a JavaScript
`if` statement.

## Tenant boundary

`workspace_id` is the single tenancy key on every user-owned table. There is no
`user_id` on business tables: ownership is derived through `workspace_members`,
which means a row cannot point at an account belonging to a different workspace.

```sql
create policy "transactions_select_member"
  on public.transactions for select
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));
```

### The `(select ...)` wrapper is mandatory

`auth.uid()` wrapped in a subquery is evaluated **once per query**. Called
bare, it is evaluated **once per row**. On a large table this is the difference
between a single InitPlan and millions of function calls.

```sql
using (auth.uid() = workspace_id)          -- slow, per row
using ((select auth.uid()) = workspace_id) -- fast, per query
```

Every policy in this repository uses the wrapped form. Do not "simplify" it.

## Cross-workspace integrity

RLS controls who may read and write a row. It does **not** stop a member of
workspace A inserting a transaction whose `account_id` belongs to workspace B,
because the foreign key is still satisfied and RLS never sees the other side.

`private.assert_same_workspace()` closes this on insert and update. It verifies
that `account_id`, `counterparty_account_id`, and `category_id` all belong to
the row's own workspace, and that the category's type matches the transaction
type.

Without the type check, an expense filed under the "Salary" category would
silently inflate income totals.

## Row shape invariants

The database refuses structurally invalid rows. These are CHECK constraints,
not application conventions:

- `amount > 0`
- a `transfer` must have a `counterparty_account_id`, it must differ from
  `account_id`, and it must have no category
- a non-transfer must have no `counterparty_account_id`
- the category type must equal the transaction type

Validation in `lib/validations.ts` mirrors these to produce a readable error.
**The database is the authority.** Application validation can be bypassed by
calling the API directly; the CHECK constraint cannot.

## Money

`numeric(14,2)` in Postgres. It crosses the API as a JSON **string**
(`"3500.00"`), not a number. Naive arithmetic produces `"3500.00100"` or
`0.30000000000000004`.

- All conversion goes through `lib/money.ts`, which uses integer minor units
  and `decimal.js`.
- All aggregation happens in SQL (`SUM` in the views in migration 04), never in
  JavaScript.
- Display formatting is the only place a decimal string is produced.

## Sessions

`src/proxy.ts` refreshes the Supabase session on every matched request. Server
Components cannot write cookies, so without this file a refreshed token is never
persisted and users are logged out at random.

Next.js 16 renamed `middleware.ts` to `proxy.ts`. The old filename is silently
ignored.

## Secrets

- The service-role key bypasses RLS entirely. It is not used anywhere in this
  repository and has no `NEXT_PUBLIC_` prefix.
- `.env.local` is gitignored; `.env.example` holds placeholders only.
- Never log a session token, a full user object, or an auth header.

## Production checklist

Before any task touching auth or data access is called complete:

1. RLS is enabled on every table in `public`.
2. A cross-tenant read test exists and passes (user A cannot read user B's rows).
3. No service-role key in any file under `src/`.
4. Every Server Action calls `requireUser()` or `requireWorkspaceId()`.
5. Input is validated with Zod on the server, not just in the form.
6. No `PATCH`/`DELETE` without an explicit `.eq('id', id)` filter — PostgREST
   matches **every** row when the filter is absent.
