-- TakaKori: row level security
--
-- Principle: authorization is enforced by the database, not by the application.
-- Application code sends no user id and is never trusted to filter correctly.
-- A user who changes a UUID in a request gets zero rows back.
--
-- Performance note: every policy wraps auth.uid() in a subquery so Postgres
-- evaluates it once per query instead of once per row. On a large table this is
-- the difference between a single InitPlan and a per-row function call.

-- ---------------------------------------------------------------------------
-- Helper: is the current user a member of this workspace?
--
-- SECURITY DEFINER is required because the policy on workspace_members would
-- otherwise recurse. The function takes its own auth.uid() check internally, so
-- possession of the function does not grant access to anything.
-- ---------------------------------------------------------------------------
create schema if not exists private;

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_workspace_member(uuid) from public;
grant execute on function private.is_workspace_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles
--
-- Profiles are keyed by auth.users.id, so membership is a direct comparison
-- rather than a workspace lookup.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- A user may create their own profile row, and only their own.
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Deliberately no delete policy: account deletion goes through a controlled
-- flow rather than a self-serve DELETE.

-- ---------------------------------------------------------------------------
-- Workspaces and membership
-- ---------------------------------------------------------------------------
alter table public.workspaces enable row level security;

create policy "workspaces_select_member"
  on public.workspaces for select
  to authenticated
  using ((select private.is_workspace_member(id)));

create policy "workspaces_update_owner"
  on public.workspaces for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = id and wm.user_id = (select auth.uid()) and wm.role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = id and wm.user_id = (select auth.uid()) and wm.role = 'owner'
    )
  );

alter table public.workspace_members enable row level security;

create policy "workspace_members_select_own"
  on public.workspace_members for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Joining a workspace is not something a client may do for itself; membership
-- is only ever created by the signup trigger, which runs as the service role.

-- ---------------------------------------------------------------------------
-- Business tables
--
-- All four follow the same shape: the caller must be a member of the row's
-- workspace. The workspace_id is never taken from the client for UPDATE, only
-- for INSERT, and the WITH CHECK on UPDATE prevents moving a row to a workspace
-- the caller does not belong to.
-- ---------------------------------------------------------------------------
alter table public.accounts enable row level security;

create policy "accounts_select_member"
  on public.accounts for select
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy "accounts_insert_member"
  on public.accounts for insert
  to authenticated
  with check ((select private.is_workspace_member(workspace_id)));

create policy "accounts_update_member"
  on public.accounts for update
  to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

create policy "accounts_delete_member"
  on public.accounts for delete
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));

alter table public.categories enable row level security;

create policy "categories_select_member"
  on public.categories for select
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy "categories_insert_member"
  on public.categories for insert
  to authenticated
  with check ((select private.is_workspace_member(workspace_id)));

create policy "categories_update_member"
  on public.categories for update
  to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

-- A category that still has transactions cannot be deleted, but the FK is
-- ON DELETE SET NULL, so deleting one orphans transactions into a null
-- category rather than destroying financial records. That is intentional.
create policy "categories_delete_member"
  on public.categories for delete
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));

alter table public.transactions enable row level security;

create policy "transactions_select_member"
  on public.transactions for select
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy "transactions_insert_member"
  on public.transactions for insert
  to authenticated
  with check ((select private.is_workspace_member(workspace_id)));

create policy "transactions_update_member"
  on public.transactions for update
  to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

create policy "transactions_delete_member"
  on public.transactions for delete
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- ---------------------------------------------------------------------------
-- Cross-workspace integrity
--
-- RLS governs who may read and write a row. It does not stop a member of
-- workspace A from inserting a transaction that references an account in
-- workspace B, because the account row is legitimately readable by neither
-- side but still satisfies its foreign key. These triggers close that gap.
-- ---------------------------------------------------------------------------
create or replace function private.assert_same_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.accounts a
    where a.id = new.account_id and a.workspace_id = new.workspace_id
  ) then
    raise exception 'account_id does not belong to workspace %', new.workspace_id
      using errcode = 'integrity_constraint_violation';
  end if;

  if new.counterparty_account_id is not null and not exists (
    select 1 from public.accounts a
    where a.id = new.counterparty_account_id and a.workspace_id = new.workspace_id
  ) then
    raise exception 'counterparty_account_id does not belong to workspace %', new.workspace_id
      using errcode = 'integrity_constraint_violation';
  end if;

  if new.category_id is not null then
    -- The category must belong to the same workspace *and* its type must match
    -- the transaction type. Without the second half, an expense could be filed
    -- under "Salary" and silently inflate income totals.
    if not exists (
      select 1 from public.categories c
      where c.id = new.category_id
        and c.workspace_id = new.workspace_id
        and c.type = new.type
    ) then
      raise exception
        'category_id % does not belong to workspace % with type %',
        new.category_id, new.workspace_id, new.type
        using errcode = 'integrity_constraint_violation';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.assert_same_workspace() from public;

create trigger transactions_assert_same_workspace
  before insert or update on public.transactions
  for each row execute function private.assert_same_workspace();