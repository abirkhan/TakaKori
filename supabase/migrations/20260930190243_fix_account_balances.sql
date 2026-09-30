-- TakaKori: correct account_balances income attribution
--
-- Bug: the original view attributed income in the same UNION branch as transfer
-- inflows, selecting `t.counterparty_account_id as account_id`. Income rows have
-- counterparty_account_id = NULL, so every income row was assigned to a NULL
-- account and dropped from the LEFT JOIN. Income never appeared in any balance.
--
-- Observed in testing: with income 80,000, expenses 3,500 + 1,000 + 999 and a
-- 5,000 transfer, Cash reported -10,499 instead of 69,501, and the sum of
-- account balances did not reconcile with lifetime net.
--
-- Fix: give income its own branch selecting `t.account_id`. Money is now only
-- attributed to an account by the branch that knows which column holds it.

create or replace view public.account_balances
with (security_invoker = true) as
with movements as (
  -- Outflow: expenses leave account_id, transfers leave account_id.
  select t.workspace_id, t.account_id, -t.amount as delta
  from public.transactions t
  where t.type in ('expense', 'transfer')

  union all

  -- Income arrives at account_id. This must be its own branch: income rows have
  -- counterparty_account_id = NULL, so folding them into the transfer branch
  -- silently attributed every income row to a NULL account and left it out of
  -- every balance.
  select t.workspace_id, t.account_id, t.amount as delta
  from public.transactions t
  where t.type = 'income'

  union all

  -- A transfer arrives at its destination.
  select t.workspace_id, t.counterparty_account_id as account_id, t.amount as delta
  from public.transactions t
  where t.type = 'transfer' and t.counterparty_account_id is not null
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
  'Current balance per account. Income lands on account_id; transfers leave account_id and arrive at counterparty_account_id. The sum of balances must equal lifetime income minus lifetime expense, since transfers net to zero.';