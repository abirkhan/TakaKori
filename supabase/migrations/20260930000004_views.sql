-- TakaKori: balance views
--
-- Balances are computed in SQL, never by summing numbers in JavaScript.
-- The amounts are numeric(14,2) and cross the API as strings, so a JS-side sum
-- would be both slow and a floating-point risk.
--
-- Transfers are excluded from income and expense totals: moving money between
-- two of your own accounts is not income or spending. For per-account balances
-- a transfer contributes -amount to the source and +amount to the destination,
-- so the workspace total correctly nets to zero.

create or replace view public.workspace_totals
with (security_invoker = true) as
select
  t.workspace_id,
  coalesce(sum(t.amount) filter (where t.type = 'income'), 0)  as total_income,
  coalesce(sum(t.amount) filter (where t.type = 'expense'), 0) as total_expense,
  coalesce(
    sum(t.amount) filter (where t.type = 'income')
    - sum(t.amount) filter (where t.type = 'expense'),
    0
  ) as net_balance,
  -- Transfers move value but do not create it. Exposed so the UI can show
  -- "৳5,000 moved between accounts" separately from income and spending.
  coalesce(sum(t.amount) filter (where t.type = 'transfer'), 0) as total_transferred
from public.transactions t
group by t.workspace_id;

comment on view public.workspace_totals is
  'Income, expense and net totals per workspace. Transfers are excluded from income and expense by construction.';

create or replace view public.account_balances
with (security_invoker = true) as
with movements as (
  -- Outflow: expenses leave account_id, transfers leave account_id.
  select
    t.workspace_id,
    t.account_id,
    -t.amount as delta
  from public.transactions t
  where t.type in ('expense', 'transfer')

  union all

  -- Inflow: income arrives, and a transfer arrives at the destination.
  select
    t.workspace_id,
    t.counterparty_account_id as account_id,
    t.amount as delta
  from public.transactions t
  where t.type = 'income'
     or (t.type = 'transfer' and t.counterparty_account_id is not null)
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
  'Current balance per account, including the effect of transfers in both directions.';

create or replace view public.expense_by_category
with (security_invoker = true) as
select
  t.workspace_id,
  t.category_id,
  c.name as category_name,
  sum(t.amount) as total
from public.transactions t
left join public.categories c on c.id = t.category_id
where t.type = 'expense'
group by t.workspace_id, t.category_id, c.name;

-- Both views use security_invoker so that RLS on the underlying tables applies
-- to the caller. Without it a view would run as its owner and could leak rows
-- across workspaces.