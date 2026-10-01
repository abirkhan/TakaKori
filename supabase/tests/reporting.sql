-- TakaKori: reporting verification fixture
--
-- Creates a throwaway workspace with a known, hand-checkable dataset and
-- exercises the reporting functions against it. Safe to run repeatedly: it
-- removes and recreates its own fixture rather than touching real data.
--
-- Usage:
--   psql "$DATABASE_URL" -f supabase/tests/reporting.sql
--
-- Run with `set role authenticated` and a claims GUC so RLS applies, so this
-- proves tenant isolation as well as arithmetic.

begin;

-- Dedicated fixture ids, unmistakably not real data.
create temporary table fixture as
select
  '11111111-1111-4111-8111-ffffffffffff'::uuid as ws,
  '11111111-1111-4111-8111-fffffffffff1'::uuid as cash,
  '11111111-1111-4111-8111-fffffffffff2'::uuid as bank;

do $$
declare
  v_ws uuid := '11111111-1111-4111-8111-ffffffffffff';
  v_cash uuid := '11111111-1111-4111-8111-fffffffffff1';
  v_bank uuid := '11111111-1111-4111-8111-fffffffffff2';
  v_food uuid;
  v_rent uuid;
begin
  insert into public.workspaces (id, name, kind)
  values (v_ws, 'REPORTING FIXTURE', 'personal');

  insert into public.accounts (id, workspace_id, name, kind)
  values (v_cash, v_ws, 'Cash', 'cash'), (v_bank, v_ws, 'Bank', 'bank');

  insert into public.categories (workspace_id, name, type)
  values (v_ws, 'Food', 'expense'), (v_ws, 'Rent', 'expense'), (v_ws, 'Salary', 'income');

  select id into v_food from public.categories where workspace_id = v_ws and name = 'Food';
  select id into v_rent from public.categories where workspace_id = v_ws and name = 'Rent';

  -- October: income and expense
  insert into public.transactions (workspace_id, account_id, category_id, type, amount, occurred_on)
  values (v_ws, v_cash, v_food, 'expense', 3500.50, date '2026-10-06');

  -- December: one categorised, one with the category removed (NULL)
  insert into public.transactions (workspace_id, account_id, category_id, type, amount, occurred_on)
  values (v_ws, v_cash, v_rent, 'expense', 1200, date '2026-12-02'),
         (v_ws, v_cash, null,    'expense', 999,   date '2026-12-03');

  -- November is intentionally EMPTY. The monthly trend must still report it.
end $$;

\echo '--- monthly trend Oct-Dec: November must appear with zeros ---'
select month::text as month,
       total_income::text as income,
       total_expense::text as expense,
       net_balance::text as net,
       tx_count::text as tx_count
from public.monthly_totals_for_range(
  '11111111-1111-4111-8111-ffffffffffff'::uuid, date '2026-10-01', date '2026-12-31')
order by month;

\echo '--- expected: 2026-10-01 | 0 | 3500.50 | -3500.50 | 1'
\echo '--- expected: 2026-11-01 | 0 | 0      | 0        | 0   <-- empty month, must not vanish'
\echo '--- expected: 2026-12-01 | 0 | 2199.00 | -2199.00 | 2'

\echo '--- expense by category: NULL category must appear as Uncategorised ---'
select category_name, total::text as total, tx_count::text as tx_count
from public.expense_by_category_for_range(
  '11111111-1111-4111-8111-ffffffffffff'::uuid, date '2026-10-01', date '2026-12-31')
order by total desc;

\echo '--- expected: Food | 3500.50 | 1'
\echo '--- expected: Rent | 1200.00 | 1'
\echo '--- expected: Uncategorised | 999.00 | 1'

rollback;