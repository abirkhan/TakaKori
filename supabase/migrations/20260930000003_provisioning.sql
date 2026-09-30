-- TakaKori: signup provisioning
--
-- Creating a profile, a workspace, a membership and a starter set of accounts
-- and categories must happen as one atomic step. Doing it from the application
-- means a user can end up authenticated with no workspace, and every query
-- then returns nothing.
--
-- This runs as a SECURITY DEFINER trigger on auth.users, so it is unaffected
-- by RLS on the tables it writes to.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid;
  display_name     text;
begin
  display_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, full_name, timezone, currency, locale)
  values (
    new.id,
    nullif(display_name, ''),
    coalesce(new.raw_user_meta_data ->> 'timezone', 'Asia/Dhaka'),
    coalesce(new.raw_user_meta_data ->> 'currency', 'BDT'),
    coalesce(new.raw_user_meta_data ->> 'locale', 'bn-BD')
  )
  on conflict (id) do nothing;

  insert into public.workspaces (name, kind)
  values (coalesce(nullif(display_name, ''), 'My Workspace'), 'personal')
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  -- One account to start. Transfer support and per-account balances are in the
  -- schema already; seeding extra accounts here would be presumptuous.
  insert into public.accounts (workspace_id, name, kind)
  values (new_workspace_id, 'Cash', 'cash');

  -- Starter categories. is_system marks these as deletable-but-restorable.
  insert into public.categories (workspace_id, name, type, is_system)
  values
    (new_workspace_id, 'Salary',    'income',  true),
    (new_workspace_id, 'Business',  'income',  true),
    (new_workspace_id, 'Freelance', 'income',  true),
    (new_workspace_id, 'Investment','income',  true),
    (new_workspace_id, 'Gift',      'income',  true),
    (new_workspace_id, 'Other',     'income',  true),
    (new_workspace_id, 'Food',        'expense', true),
    (new_workspace_id, 'Transport',   'expense', true),
    (new_workspace_id, 'Bills',       'expense', true),
    (new_workspace_id, 'Shopping',    'expense', true),
    (new_workspace_id, 'Health',      'expense', true),
    (new_workspace_id, 'Education',   'expense', true),
    (new_workspace_id, 'Entertainment','expense', true),
    (new_workspace_id, 'Rent',        'expense', true),
    (new_workspace_id, 'Other',       'expense', true);

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to supabase_auth_admin;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();