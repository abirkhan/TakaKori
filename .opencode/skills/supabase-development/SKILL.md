---
name: Supabase Development
description: Rules for schema changes, migrations, RLS policies, and Supabase client usage in TakaKori. Load before writing migrations, altering tables, adding policies, or touching src/lib/supabase/.
---

# Supabase development

## Schema changes

**Migrations are the only way the schema changes.** Never use the Supabase
dashboard to create or alter tables, columns, indexes, or policies. A change
made in the dashboard is not in the repository, so the next developer — human
or agent — will not know it exists.

```bash
npx supabase migration new <descriptive_name>
npx supabase db push
npx supabase gen types types/database.ts   # required; commit the result
```

Never edit a migration that has already been applied. Add a new one.

## Every new table ships with

1. `workspace_id uuid not null references public.workspaces (id) on delete cascade`
2. `enable row level security`
3. Policies for `select`, `insert`, `update`, `delete`
4. An index on `workspace_id`
5. `updated_at timestamptz` with the `set_updated_at` trigger

A table without RLS is readable by any authenticated user through the API,
regardless of what the application code does.

## Policy rules

**Always wrap `auth.uid()` in a subquery.**

```sql
using (auth.uid() = workspace_id)           -- evaluated per row. Slow.
using ((select auth.uid()) = workspace_id)  -- evaluated per query. Correct.
```

**Always filter by workspace in application code too.** RLS is the guarantee;
the explicit filter is the performance. Both.

**`WITH CHECK` on `update` and `insert`.** `USING` alone validates the old row.
Without `WITH CHECK`, a user can read their row and then write it into a
workspace they do not belong to.

```sql
create policy "transactions_update_member"
  on public.transactions for update
  to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
```

## PostgREST footguns

**A `PATCH` or `DELETE` without an `id` filter updates or deletes every row.**

```ts
// Deletes the user's entire transaction history.
await supabase.from('transactions').delete().eq('workspace_id', id)

// Correct.
await supabase.from('transactions').delete().eq('id', transactionId)
```

Every mutation filters on the primary key. This is not optional.

**`numeric` returns as a string.** `{ amount: "3500.00" }`. See the
`financial-data` skill.

**`select=*` on wide tables** ships columns nobody needs. Select explicitly.

## Client boundaries

| File                     | Runs in                            | May write cookies      |
| ------------------------ | ---------------------------------- | ---------------------- |
| `lib/supabase/client.ts` | browser                            | yes                    |
| `lib/supabase/server.ts` | server components, actions, routes | only in actions/routes |
| `lib/supabase/proxy.ts`  | `src/proxy.ts`                     | yes                    |

Server Components cannot write cookies. `server.ts` swallows the resulting
error by design, because `proxy.ts` has already refreshed the session. Do not
"fix" that catch — it would reintroduce the desync.

## Never

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser, or give it a
  `NEXT_PUBLIC_` prefix. It bypasses RLS entirely.
- Never create a `SECURITY DEFINER` function without an explicit `auth.uid()`
  check inside the body, `set search_path = ''`, and a `revoke` from `public`.
- Never add a policy that references another policy's table without going
  through a `SECURITY DEFINER` helper, or you get infinite recursion.
- Never test against production. `project_ref` in `opencode.jsonc` is
  scoped to the dev project.

## After any schema change

Run `npm run verify`, regenerate types, and add or update the RLS test that
covers the new table.
