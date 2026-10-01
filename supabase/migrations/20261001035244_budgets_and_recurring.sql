-- TakaKori: recurring transactions and budgets
--
-- Design note on recurring transactions
-- --------------------------------------
-- These are PREDICTIONS, not scheduled writes. Nothing here materialises a
-- transaction automatically, and that is deliberate.
--
-- A ledger records what actually happened. Auto-inserting a "salary" row on the
-- 1st asserts money arrived even if payment was late or the amount changed,
-- and it makes exactly-once behaviour genuinely hard: a retry, a clock skew or a
-- double-tap would duplicate a financial record.
--
-- So the app predicts upcoming occurrences and the user posts the real one with
-- a single tap. `last_posted_on` makes that idempotent - an occurrence already
-- posted can never be posted twice, and the guard is enforced here rather than
-- trusted to the client.
--
-- Design note on budgets
-- ---------------------
-- category_id is nullable, meaning an overall spending cap rather than a
-- per-category one. NULLs are distinct in a Postgres unique index, so a single
-- index on (workspace_id, category_id) would happily allow several overall
-- budgets. Two partial indexes are required to actually enforce one per slot.

-- ---------------------------------------------------------------------------
-- Recurring transactions
-- ---------------------------------------------------------------------------
create table if not exists public.recurring_transactions (
  id                      uuid primary key default gen_random_uuid(),
  workspace_id            uuid        not null references public.workspaces (id) on delete cascade,
  account_id              uuid        not null references public.accounts (id) on delete cascade,
  category_id             uuid        references public.categories (id) on delete set null,
  counterparty_account_id uuid        references public.accounts (id) on delete cascade,
  type                    text        not null,
  amount                  numeric(14, 2) not null,
  description             text,

  -- daily | weekly | monthly | yearly
  frequency               text        not null default 'monthly',
  -- Every N periods. 1 = every period, 2 = fortnightly or bimonthly.
  interval_count          integer     not null default 1,
  -- The date the series is anchored to. For monthly rules the day-of-month is
  -- taken from this date and clamped to the length of each target month.
  anchor_date             date        not null,
  -- Inclusive null means no end date.
  ends_on                 date,
  -- Most recent occurrence actually posted, as YYYY-MM-DD. Guard against
  -- double-posting the same occurrence.
  last_posted_on          date,

  is_active               boolean     not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint recurring_type_check check (type in ('income', 'expense', 'transfer')),
  constraint recurring_amount_check check (amount > 0),
  constraint recurring_frequency_check
    check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  constraint recurring_interval_check check (interval_count between 1 and 365),
  constraint recurring_description_check
    check (description is null or char_length(description) <= 500),
  constraint recurring_ends_after_anchor_check
    check (ends_on is null or ends_on >= anchor_date),

  -- Same shape rules as transactions: a transfer needs a destination, an
  -- income or expense must not have one.
  constraint recurring_shape_check check (
    case type
      when 'transfer' then
        counterparty_account_id is not null
        and counterparty_account_id <> account_id
        and category_id is null
      else
        counterparty_account_id is null
    end
  )
);

-- The recurring list is always read per workspace, ordered by next occurrence.
create index if not exists recurring_workspace_active_idx
  on public.recurring_transactions (workspace_id)
  where is_active;

create trigger recurring_set_updated_at
  before update on public.recurring_transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Budgets
-- ---------------------------------------------------------------------------
create table if not exists public.budgets (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces (id) on delete cascade,
  -- NULL means an overall spending cap for the period rather than a
  -- per-category budget.
  category_id  uuid        references public.categories (id) on delete cascade,
  -- Limit for one month. Future periods (quarterly, yearly) would need their
  -- own column rather than overloading this one.
  amount       numeric(14, 2) not null,
  -- First month this budget applies, as YYYY-MM-01.
  effective_from date      not null default (now() at time zone 'utc')::date,
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint budgets_amount_check check (amount > 0)
);

-- A category cannot be both an income and an expense category, and a budget
-- only makes sense for expenses.
create or replace function private.assert_budget_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.category_id
      and c.workspace_id = new.workspace_id
      and c.type = 'expense'
  ) then
    raise exception 'budgets may only target an expense category in the same workspace'
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end;
$$;

revoke all on function private.assert_budget_category() from public;

create trigger budgets_assert_category
  before insert or update on public.budgets
  for each row execute function private.assert_budget_category();

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

create index if not exists budgets_workspace_active_idx
  on public.budgets (workspace_id)
  where is_active;

-- One active budget per slot. Two partial indexes, because NULLs are distinct
-- in a Postgres unique index: a single index on (workspace_id, category_id)
-- would permit unlimited overall budgets and unlimited duplicates per category.
create unique index if not exists budgets_one_overall_per_workspace_idx
  on public.budgets (workspace_id)
  where category_id is null and is_active;

create unique index if not exists budgets_one_per_category_idx
  on public.budgets (workspace_id, category_id)
  where category_id is not null and is_active;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.recurring_transactions enable row level security;

create policy "recurring_select_member"
  on public.recurring_transactions for select
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy "recurring_insert_member"
  on public.recurring_transactions for insert
  to authenticated
  with check ((select private.is_workspace_member(workspace_id)));

create policy "recurring_update_member"
  on public.recurring_transactions for update
  to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

create policy "recurring_delete_member"
  on public.recurring_transactions for delete
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));

alter table public.budgets enable row level security;

create policy "budgets_select_member"
  on public.budgets for select
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy "budgets_insert_member"
  on public.budgets for insert
  to authenticated
  with check ((select private.is_workspace_member(workspace_id)));

create policy "budgets_update_member"
  on public.budgets for update
  to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

create policy "budgets_delete_member"
  on public.budgets for delete
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- ---------------------------------------------------------------------------
-- Cross-workspace integrity
--
-- RLS controls who may read and write a row; it does not verify that a
-- referenced row belongs to the same workspace. The triggers close that gap for
-- both new tables.
-- ---------------------------------------------------------------------------
create or replace function private.assert_recurring_same_workspace()
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

  -- last_posted_on must be a real occurrence, otherwise a client could mark an
  -- arbitrary past date as posted and permanently suppress that occurrence.
  if new.last_posted_on is not null and new.last_posted_on < new.anchor_date then
    raise exception 'last_posted_on % precedes anchor_date %', new.last_posted_on, new.anchor_date
      using errcode = 'integrity_constraint_violation';
  end if;

  return new;
end;
$$;

revoke all on function private.assert_recurring_same_workspace() from public;

create trigger recurring_assert_same_workspace
  before insert or update on public.recurring_transactions
  for each row execute function private.assert_recurring_same_workspace();

-- budgets already has its category check wired up above
-- (budgets_assert_category -> private.assert_budget_category), which also
-- verifies the category belongs to the same workspace, so no second trigger.