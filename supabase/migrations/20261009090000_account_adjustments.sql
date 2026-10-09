-- TakaKori: balance adjustments
--
-- **What this is for.** An account's `opening_balance` is a starting point with no
-- ledger entry behind it, so changing it moves the balance with nothing explaining
-- why. Worse, the number a user sees on the Account screen is a *computed* balance,
-- while the field they would edit is the opening balance - and on a real account
-- those are different numbers. Verified: an account showing ৳5,000.00 had
-- `opening_balance` 0.00 and one transaction of +5,000.00.
--
-- So a correction is recorded here instead: a signed row against the account, with
-- an optional reason, and the balance becomes
--
--     opening_balance + income - expense + adjustments
--
-- **Why this is a table and not a fourth transaction type.** A type would have to
-- be added to `transactions_type_check`, and every aggregate that splits income
-- from expense by type filter would then need to handle it deliberately:
-- `workspace_totals`, `net_balance`, `account_balances`, `expense_by_category` and
-- the range-scoped RPCs. An adjustment belongs to neither bucket, so any of those
-- left unchanged silently excludes it and `net_balance` becomes wrong - the
-- ADR-012 failure exactly, a balance that looks plausible and is not.
--
-- As a separate table it is not a transaction at all, so income and expense totals
-- are untouched by construction. Two balance views change; the aggregates do not.
--
-- `amount` is **signed** and may be negative, unlike `transactions.amount`, which is
-- `> 0` and carries its direction in `type`. An adjustment has no direction of its
-- own to encode it in, so the sign is the direction.
--
-- This is the one migration in the project that adds a table rather than editing
-- one, and the reconciliation assertion at the bottom is the point of it.

create table if not exists public.account_adjustments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete restrict,
  -- Signed. Zero is allowed but pointless; a nonzero check would only stop a user
  -- correcting a figure with the same figure.
  amount numeric(14, 2) not null,
  -- Optional. A correction is worth a word even when the amount speaks for itself,
  -- but not every one can be summarised in a few characters.
  reason text,
  created_at timestamptz not null default now(),

  constraint account_adjustments_reason_check
    check (reason is null or char_length(reason) <= 200)
);

comment on table public.account_adjustments is
  'Signed corrections to an account balance, outside income and expense. See ADR-045.';

create index if not exists account_adjustments_account_idx
  on public.account_adjustments (account_id);

create index if not exists account_adjustments_workspace_idx
  on public.account_adjustments (workspace_id);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Same four policies as `transactions`, for the same reason: membership decides
-- access, and the inner call is wrapped in a scalar subquery so it is evaluated once
-- per query rather than once per row.
-- ---------------------------------------------------------------------------
alter table public.account_adjustments enable row level security;

create policy "account_adjustments_select_member"
  on public.account_adjustments for select
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy "account_adjustments_insert_member"
  on public.account_adjustments for insert
  to authenticated
  with check ((select private.is_workspace_member(workspace_id)));

create policy "account_adjustments_update_member"
  on public.account_adjustments for update
  to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

create policy "account_adjustments_delete_member"
  on public.account_adjustments for delete
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- ---------------------------------------------------------------------------
-- Cross-workspace integrity
--
-- RLS says who may write a row; it does not stop a member of workspace A pointing
-- an adjustment at an account in workspace B, which the account RLS would not
-- prevent them from reading either. Same trigger shape as `transactions`.
-- ---------------------------------------------------------------------------
create or replace function private.assert_adjustment_same_workspace()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.accounts a
    where a.id = new.account_id and a.workspace_id = new.workspace_id
  ) then
    raise exception 'That account is not in this workspace.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger account_adjustments_same_workspace
  before insert or update on public.account_adjustments
  for each row execute function private.assert_adjustment_same_workspace();

-- ---------------------------------------------------------------------------
-- Balances
--
-- `account_balances` is the only view whose definition changes: an adjustment is a
-- signed delta on one account, exactly like a movement.
--
-- `workspace_totals` deliberately does **not** change. A correction is neither
-- income nor spending, so adding it there would put a reconciliation into "income
-- this month" - which is the opposite of what it is for. It shows up in the balance,
-- and nowhere else.
-- ---------------------------------------------------------------------------
create or replace view public.account_balances
with (security_invoker = true) as
with movements as (
  select
    t.workspace_id,
    t.account_id,
    -t.amount as delta
  from public.transactions t
  where t.type in ('expense', 'transfer')

  union all

  -- Income arrives at account_id. This must be its own branch, and it is written
  -- out here in full rather than copied from `views.sql`, because `views.sql` had
  -- the original defect this project records in ADR: income folded into the
  -- transfer branch under `counterparty_account_id`, which is NULL for income, so
  -- every income row was attributed to no account and dropped. Copying that shape
  -- would have reintroduced a fixed bug, and the assertion at the bottom of this
  -- file caught exactly that.
  select t.workspace_id, t.account_id, t.amount as delta
  from public.transactions t
  where t.type = 'income'

  union all

  -- A transfer arrives at its destination.
  select t.workspace_id, t.counterparty_account_id as account_id, t.amount as delta
  from public.transactions t
  where t.type = 'transfer' and t.counterparty_account_id is not null

  union all

  -- Adjustments: their own table, so no type filter and no direction to infer.
  select workspace_id, account_id, amount as delta
  from public.account_adjustments
)
select
  a.workspace_id,
  a.id as account_id,
  a.name,
  a.kind,
  a.opening_balance + coalesce(sum(m.delta), 0) as balance
from public.accounts a
left join movements m
  on m.account_id = a.id and m.workspace_id = a.workspace_id
group by a.workspace_id, a.id, a.name, a.kind, a.opening_balance;

comment on view public.account_balances is
  'Current balance per account: opening balance, transfers in both directions, and adjustments. Adjustments are excluded from income and expense totals by construction.';

-- ---------------------------------------------------------------------------
-- ADR-012, asserted rather than argued
--
-- The invariant this project records being violated before: a balance that reads
-- plausibly and is wrong. The statement below fails loudly if an account's balance
-- stops equalling its own components. Run it after any future change to either.
-- ---------------------------------------------------------------------------
do $$
declare
  mismatch int;
begin
  select count(*) into mismatch
  from public.account_balances b
  where b.balance is distinct from (
    select a.opening_balance
      + coalesce((
          select sum(case t.type when 'expense' then -t.amount
                                 when 'transfer' then -t.amount
                                 else t.amount end)
          from public.transactions t
          where t.account_id = b.account_id
        ), 0)
      + coalesce((
          select sum(t.amount)
          from public.transactions t
          where t.type = 'transfer'
            and t.counterparty_account_id = b.account_id
        ), 0)
      + coalesce((
          select sum(adj.amount)
          from public.account_adjustments adj
          where adj.account_id = b.account_id
        ), 0)
    from public.accounts a
    where a.id = b.account_id
  );

  if mismatch > 0 then
    raise exception
      'ADR-012 violated: % account(s) have a balance that does not equal opening_balance + movements + adjustments.',
      mismatch;
  end if;
end;
$$;