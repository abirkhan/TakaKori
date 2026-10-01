-- TakaKori: reporting aggregates
--
-- The existing views are lifetime-only. Reports need periods, and they must
-- include empty periods.
--
-- Why empty periods matter: a monthly trend that only emits months containing
-- transactions makes a three-month saving streak look like one busy month. The
-- month series is generated with generate_series and LEFT JOINed, so a month
-- with no spending reports zero income and zero expense rather than vanishing.

-- ---------------------------------------------------------------------------
-- Income / expense per calendar month across an inclusive range.
--
-- Rows are returned for every month the range touches, in ascending order.
-- ---------------------------------------------------------------------------
create or replace function public.monthly_totals_for_range(
  target_workspace_id uuid,
  range_from date,
  range_to date
)
returns table (
  month        date,
  total_income numeric,
  total_expense numeric,
  net_balance  numeric,
  tx_count     bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with months as (
    select generate_series(
      date_trunc('month', range_from)::date,
      date_trunc('month', range_to)::date,
      interval '1 month'
    )::date as month
  ),
  agg as (
    select
      date_trunc('month', t.occurred_on)::date as month,
      coalesce(sum(t.amount) filter (where t.type = 'income'), 0)  as total_income,
      coalesce(sum(t.amount) filter (where t.type = 'expense'), 0) as total_expense,
      count(*) as tx_count
    from public.transactions t
    where t.workspace_id = target_workspace_id
      and t.occurred_on >= range_from
      and t.occurred_on <= range_to
    group by 1
  )
  select
    m.month,
    coalesce(a.total_income, 0),
    coalesce(a.total_expense, 0),
    -- Each side coalesced separately. See ADR-015.
    coalesce(a.total_income, 0) - coalesce(a.total_expense, 0),
    coalesce(a.tx_count, 0)
  from months m
  left join agg a on a.month = m.month
  order by m.month;
$$;

revoke all on function public.monthly_totals_for_range(uuid, date, date) from public;
grant execute on function public.monthly_totals_for_range(uuid, date, date) to authenticated;

comment on function public.monthly_totals_for_range(uuid, date, date) is
  'Income, expense and net per calendar month across an inclusive range. Returns a row for every month the range touches, including months with no transactions. Transfers are excluded from income and expense.';

-- ---------------------------------------------------------------------------
-- Expense per category across an inclusive range.
--
-- Transactions whose category was deleted keep a NULL category_id (the FK is
-- ON DELETE SET NULL). Those are grouped under a NULL id with the label
-- "Uncategorised" so the money is still visible rather than dropped.
-- ---------------------------------------------------------------------------
create or replace function public.expense_by_category_for_range(
  target_workspace_id uuid,
  range_from date,
  range_to date
)
returns table (
  category_id   uuid,
  category_name text,
  total         numeric,
  tx_count      bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.category_id,
    coalesce(c.name, 'Uncategorised') as category_name,
    sum(t.amount) as total,
    count(*) as tx_count
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.workspace_id = target_workspace_id
    and t.type = 'expense'
    and t.occurred_on >= range_from
    and t.occurred_on <= range_to
  group by t.category_id, coalesce(c.name, 'Uncategorised')
  order by sum(t.amount) desc;
$$;

revoke all on function public.expense_by_category_for_range(uuid, date, date) from public;
grant execute on function public.expense_by_category_for_range(uuid, date, date) to authenticated;

comment on function public.expense_by_category_for_range(uuid, date, date) is
  'Expense per category for an inclusive date range, largest first. Deleted categories appear as "Uncategorised".';

-- ---------------------------------------------------------------------------
-- Income per category across an inclusive range, for symmetry with the above.
-- ---------------------------------------------------------------------------
create or replace function public.income_by_category_for_range(
  target_workspace_id uuid,
  range_from date,
  range_to date
)
returns table (
  category_id   uuid,
  category_name text,
  total         numeric,
  tx_count      bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.category_id,
    coalesce(c.name, 'Uncategorised') as category_name,
    sum(t.amount) as total,
    count(*) as tx_count
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.workspace_id = target_workspace_id
    and t.type = 'income'
    and t.occurred_on >= range_from
    and t.occurred_on <= range_to
  group by t.category_id, coalesce(c.name, 'Uncategorised')
  order by sum(t.amount) desc;
$$;

revoke all on function public.income_by_category_for_range(uuid, date, date) from public;
grant execute on function public.income_by_category_for_range(uuid, date, date) to authenticated;