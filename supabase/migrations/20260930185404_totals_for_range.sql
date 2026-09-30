-- TakaKori: range-scoped totals
--
-- workspace_totals is deliberately range-free, so it can only answer "lifetime".
-- Reporting needs "this month", "last quarter", "between these dates" — all of
-- which must be computed in SQL rather than by summing strings in JavaScript.
--
-- SECURITY INVOKER means RLS on transactions applies to the calling user, so
-- this function cannot leak another workspace's totals. The workspace_id is a
-- parameter, so it must also be verified that the caller belongs to it.

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
    coalesce(
      sum(t.amount) filter (where t.type = 'income')
      - sum(t.amount) filter (where t.type = 'expense'),
      0
    ),
    coalesce(sum(t.amount) filter (where t.type = 'transfer'), 0),
    count(*)
  from public.transactions t
  where t.workspace_id = target_workspace_id
    and t.occurred_on >= range_from
    and t.occurred_on <= range_to;
$$;

revoke all on function public.workspace_totals_for_range(uuid, date, date) from public;
grant execute on function public.workspace_totals_for_range(uuid, date, date) to authenticated;

comment on function public.workspace_totals_for_range(uuid, date, date) is
  'Income, expense, net and transfer totals for a workspace within an inclusive date range. Transfers are excluded from income and expense. RLS applies via SECURITY INVOKER.';