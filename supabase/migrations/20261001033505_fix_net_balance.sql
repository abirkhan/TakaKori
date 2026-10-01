-- TakaKori: fix net_balance when one side of the period is empty
--
-- Bug: both the workspace_totals view and workspace_totals_for_range computed
-- net balance as
--
--   coalesce(
--     sum(amount) filter (where type = 'income')
--     - sum(amount) filter (where type = 'expense'),
--     0
--   )
--
-- COALESCE wraps the whole subtraction, so it only rescues the result when the
-- difference itself is NULL. A filtered SUM with no matching rows returns NULL,
-- and NULL - 4500 is NULL. So any period with income but no expense - or
-- expense but no income - reported net_balance as 0.
--
-- Observed in the running app: a workspace with a single 3,500.50 expense and
-- no income showed "Saved this month: 0.00" instead of -3,500.50. A workspace
-- with only income would have reported 0 savings too. This is the common case,
-- not an edge case: most months have some income and some expense, but a new
-- user recording their first expense hit it immediately.
--
-- Fix: COALESCE each side independently, so a missing side is 0 and the other
-- side still contributes.

create or replace view public.workspace_totals
with (security_invoker = true) as
select
  t.workspace_id,
  coalesce(sum(t.amount) filter (where t.type = 'income'), 0)  as total_income,
  coalesce(sum(t.amount) filter (where t.type = 'expense'), 0) as total_expense,
  -- Each side coalesced separately. See the note above.
  coalesce(sum(t.amount) filter (where t.type = 'income'), 0)
    - coalesce(sum(t.amount) filter (where t.type = 'expense'), 0) as net_balance,
  coalesce(sum(t.amount) filter (where t.type = 'transfer'), 0) as total_transferred
from public.transactions t
group by t.workspace_id;

comment on view public.workspace_totals is
  'Income, expense and net totals per workspace. Transfers are excluded from income and expense. net_balance is negative when expenses exceed income.';

create or replace function public.workspace_totals_for_range(
  target_workspace_id uuid,
  range_from date,
  range_to date
)
returns table (
  total_income     numeric,
  total_expense    numeric,
  net_balance      numeric,
  total_transferred numeric,
  transaction_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
    -- Each side coalesced separately. A wrapped coalesce would report 0 for any
    -- period where one side is empty.
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0)
      - coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'transfer'), 0),
    count(*)
  from public.transactions t
  where t.workspace_id = target_workspace_id
    and t.occurred_on >= range_from
    and t.occurred_on <= range_to;
$$;

comment on function public.workspace_totals_for_range(uuid, date, date) is
  'Income, expense, net and transfer totals for a workspace within an inclusive date range. Transfers are excluded from income and expense. RLS applies via SECURITY INVOKER.';